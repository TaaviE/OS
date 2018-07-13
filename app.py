#!/usr/bin/python3
# coding=utf-8
"""
A simple Estonian dictionary aggregator website in Python
Copyright (C) 2018 Taavi Eomäe

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""

from raven import Client
from config import Config

sentry = Client(Config.SENTRY_DSN)
from logging import INFO
from re import sub, compile
from flask import Flask, jsonify, render_template
from flask_wtf.csrf import CSRFProtect
from celery import Celery
from bs4 import BeautifulSoup
from requests import Session
from raven.contrib.celery import register_signal, register_logger_signal
from raven.contrib.flask import Sentry

app = Flask(__name__)
app.config.from_object("config.Config")

celery = Celery(app.name, broker=app.config["CELERY_BROKER_URL"])
celery.conf.update(app.config)

# Initialize CSRF protection
csrf = CSRFProtect(app)

# Initialize error reporting
register_logger_signal(sentry)
register_logger_signal(sentry, loglevel=INFO)
register_signal(sentry)
register_signal(sentry, ignore_expected=True)
sentry = Sentry(app, dsn=app.config["SENTRY_DSN"])

headers = {"User-Agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chromium/66.0.3359.181 Safari/537.36",
           "Connection": "keep-alive"}
# Individual sessions for every page, might need to reconfigure
sessions = {"õs": Session(),
            "seletav": Session(),
            "wictionary": Session(),
            "murdesõnastik": Session(),
            "vallaste": Session(),
            "arvutisõnastik": Session()}
for name, session in sessions.items():
    session.headers = headers


@celery.task(bind=True)
def os_task(self, word):
    """Task that fetches results from ÕS"""
    html = sessions["õs"].get("http://www.eki.ee/dict/qs/index.cgi?F=M&Q=" + word).content
    # with open("./tests/data/[ÕS] Eesti õigekeelsussõnaraamat ÕS 2013-Tere.html") as file:
    #     html = file.read()

    self.update_state(state="WORKING",
                      meta={"progress": 50,
                            "result": "Töötlen tulemust"}
                      )
    # print(html)
    soup = BeautifulSoup(html, "html.parser")
    amount = soup.find_all("p", {"class": "inf"})[0].get_text()
    if "Päring ei andnud tulemusi!" in amount:
        amount = 0
        return {"progress": 100, "count": amount, "result": ""}
    else:
        amount = amount.split(" ")[1]
    results = soup.find_all("div", {"class": "tervikart"})
    self.update_state(state="PROGRESS",
                      meta={"progress": 75,
                            "result": "Töötlen tulemust"}
                      )
    clean_results = eki_cleanup_html(results)

    return {"progress": 100, "count": amount, "result": clean_results}


def eki_cleanup_html(input_html):
    output = []
    for result in input_html:
        sub_results = result.find_all("span", {"class": "leitud_ss"})
        if len(sub_results) == 0:
            sub_results = result.find_all("span", {"class": "leitud_id"})

        for sub_result in sub_results:
            highlight = BeautifulSoup().new_tag("highlight")
            # highlight.string = sub_result.get_text()
            sub_result.wrap(highlight)
            sub_result.unwrap()
        output.append(remove_tags_and_beautify(result))
    return output


def remove_tags_and_beautify(html):
    html = str(html)
    tag_strip_regex = compile(r"<(.*?)>")
    html = html.replace("&lt;", "")
    html = html.replace("&gt;", "")
    html = html.replace("<highlight>", "[highlight]")
    html = html.replace("</highlight>", "[/highlight]")
    while ('<' in html) and ('>' in html):
        html = sub(tag_strip_regex, "", html)
    html = html.replace("[highlight]", "<span class=\"highlight-word\">")
    html = html.replace("[/highlight]", "</span>")
    return html


def strip_wiki_tags(html):
    html = str(html)
    tag_strip_regex = compile(r"{{(.*?)}}")  # Remove tags
    while ("{{" in html) and ("}}" in html):
        html = sub(tag_strip_regex, "", html)

    tag_strip_regex = compile(r"{(.*?)}")  # Remove CSS
    while ("{" in html) and ("}" in html):
        html = sub(tag_strip_regex, "", html)

    return html


def highlight_word_in_html(html, word):
    return str(html).replace(word, "<span class=\"highlight-word\">" + word + "</span>")


@celery.task(bind=True)
def seletav_task(self, word):
    """Task that fetches results from SS"""
    html = sessions["seletav"].get("https://www.eki.ee/dict/ekss/index.cgi?F=M&Q=" + word).content
    # with open("./tests/data/[EKSS] Eesti keele seletav sõnaraamat-Tere.html") as file:
    #     html = file.read()

    self.update_state(state="PROGRESS",
                      meta={"progress": 50,
                            "result": "Parsing result"}
                      )
    # print(html)
    soup = BeautifulSoup(html, "html.parser")
    amount = soup.find_all("p", {"class": "inf"})[0].get_text()
    self.update_state(state="PROGRESS",
                      meta={"progress": 75,
                            "result": "Töötlen tulemust"}
                      )
    results = soup.find_all("div", {"class": "tervikart"})
    self.update_state(state="PROGRESS",
                      meta={"progress": 80,
                            "result": "Töötlen tulemust"}
                      )
    clean_results = []
    for result in results:
        clean_results.append(
            remove_tags_and_beautify(result).replace(word, "<span class=\"highlight-word\">" + word + "</span>", 1))

    return {"progress": 100, "count": amount, "result": clean_results}


@celery.task(bind=True)
def wictionary_task(self, word):
    """Task that fetches Wictionary"""
    count = 1
    html = sessions["wictionary"].get("https://et.wiktionary.org/w/index.php?action=raw&title=" + word).content
    html = html.decode("utf-8")
    # with open("./tests/data/Wiktionary-Tere.html") as file:
    #     html = file.read()

    self.update_state(state="PROGRESS",
                      meta={"progress": 50,
                            "result": "Parsing result"}
                      )

    translation_start_string = "#:'''Tõlked''':"
    location_translation_start = html.find(translation_start_string)
    result = html[:location_translation_start]
    result = result.replace("\n", "")
    result = strip_wiki_tags(remove_tags_and_beautify(result))
    self.update_state(state="PROGRESS",
                      meta={"progress": 75,
                            "result": "Töötlen tulemust"}
                      )
    if len(result.replace(word, "").replace("\n", "").replace(" ", "").strip()) < 15:  # Get rid of useless results
        result = ""
        count = 0
    elif "Wikimedia Error" in result:
        result = ""
        count = 0

    return {"progress": 100, "count": count, "result": result}


@celery.task(bind=True)
def murdesonastik_task(self, word):
    """Task that fetches MS"""
    html = sessions["murdesõnastik"].get("http://www.eki.ee/dict/ems/index.cgi?F=K&Q=" + word).content

    soup = BeautifulSoup(html, "html.parser")
    self.update_state(state="PROGRESS",
                      meta={"progress": 50,
                            "result": "Töötlen tulemust"}
                      )
    amount = soup.find_all("p", {"class": "inf"})[0].get_text()
    results = soup.find_all("div", {"class": "tervikart"})
    clean_results = []

    self.update_state(state="PROGRESS",
                      meta={"progress": 75,
                            "result": "Töötlen tulemust"})
    for result in results:
        clean_results.append(highlight_word_in_html(remove_tags_and_beautify(result), word))

    return {"progress": 100, "count": amount, "result": clean_results}


@celery.task(bind=True)
def vallaste_task(self, word):
    """Task that fetches Vallaste"""
    search_html = sessions["vallaste"].post("http://www.vallaste.ee/list.asp",
                                            data={"Type": "Sona",
                                                  "otsing": word,
                                                  "B1": "OTSI",
                                                  }
                                            ).content
    soup = BeautifulSoup(search_html, "html.parser")
    selected_links = soup.find_all("a", {"target": "parem"}, href=True)
    links = []
    self.update_state(state="PROGRESS",
                      meta={"progress": 25,
                            "result": "Töötlen tulemust"})
    for link_index, link in enumerate(selected_links):
        link = link["href"]
        links.append(link)
        if link_index > 5:  # Limit to five results from the site
            break

    clean_result = []
    progress = 50
    self.update_state(state="PROGRESS",
                      meta={"progress": progress,
                            "result": "Töötlen tulemust"})
    for link in links:
        content = sessions["vallaste"].get("http://www.vallaste.ee/" + link).content
        content = content.decode("windows-1257").replace("</b></span></br>", " - ")
        soup = BeautifulSoup(content, "html.parser")
        content = soup.select("body")
        content = remove_tags_and_beautify(content)
        content = content.replace("\n", "")
        content = content.replace("\r", "")
        content = content.replace("\t", "")
        content = content.replace("[", "")
        content = content.replace("]", "")
        content = content.replace(word, "<span class=\"highlight-word\">" + word + "</span>", 1)
        clean_result.append(content)
        progress += 10
        self.update_state(state="PROGRESS",
                          meta={"progress": progress,
                                "result": "Töötlen tulemust"})

    return {"progress": 100, "count": len(selected_links), "result": clean_result}


@celery.task(bind=True)
def arvutisonastik_task(self, word):
    """Task that fetches arvutisõnastik"""
    html = sessions["arvutisõnastik"].get(
        "http://www.keeleveeb.ee/dict/speciality/computer/dict.cgi?lang=et&word=" + word).content
    # with open("./tests/data/L. Liikane, M. Kesa. Arvutisõnastik-Tere.html") as file:
    #    html = file.read()
    # print(html)
    soup = BeautifulSoup(html, "html.parser")
    results = soup.find_all("tr")
    clean_results = []
    self.update_state(state="PROGRESS",
                      meta={"progress": 50,
                            "result": "Töötlen tulemust"})
    for result in results:
        result = str(result).replace(word, "<highlight>" + word + "</highlight>", 1)
        clean_results.append(remove_tags_and_beautify(result))
    return {"progress": 100, "count": 0, "result": clean_results}


# For easier task lookup
dictionary_tasks = {"õs": os_task,
                    "seletav": seletav_task,
                    "wictionary": wictionary_task,
                    "murdesõnastik": murdesonastik_task,
                    "vallaste": vallaste_task,
                    "arvutisõnastik": arvutisonastik_task}

# This is for validating input
dictionaries = dictionary_tasks.keys()


@app.route("/start/<dictionary>/<word>", methods=["POST", "GET"])
def dictionary_lookup(dictionary, word):
    if dictionary in dictionaries:
        task = dictionary_tasks[dictionary].apply_async(args=(word,))
        return jsonify({"task_id": task.id})
    else:
        return jsonify({"task_id": ""})


@app.route("/status/<dictionary>/<task_id>", methods=["POST", "GET"])
def task_status(dictionary, task_id):
    try:
        task_function = dictionary_tasks[dictionary]
    except NameError:
        response = {
            "state": "INVALID",
            "status": "Invalid..."
        }
        return jsonify(response)

    task = task_function.AsyncResult(task_id)

    if task.state == "PENDING":
        response = {
            "status": "PENDING",
            "state": "Järjekorras"
        }
    elif task.state == "SUCCESS":
        response = {
            "status": "SUCCESS",
            "state": task.result
        }
    elif task.state == "PROGRESS":
        response = {
            "status": "WORKING",
            "state": task.result
        }
    elif task.state == "FAILURE":
        response = {
            "status": "FAILURE",
            "state": "Tekkis viga"
        }
    else:
        response = {
            "status": "ERROR",
            "state": "Tekkis viga",
        }

    return jsonify(response)


@app.route("/")
@app.route("/<word>")
def index(word=""):
    empty = False
    if word is "":
        empty = True

    return render_template("dictionary.html", empty=empty, word=word, raven_dsn=Config.SENTRY_PUBLIC_DSN)


if __name__ == "__main__":
    app.run(host="0.0.0.0")
