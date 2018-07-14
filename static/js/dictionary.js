let csrf_token;
let dictionary_state = {
    "õs": "EMPTY",
    "seletav": "EMPTY",
    "wictionary": "EMPTY",
    "murdesõnastik": "EMPTY",
    "vallaste": "EMPTY",
    "arvutisõnastik": "EMPTY",
    "lukus": "EMPTY",
};

window.onload = function () {
    //Raven.config('https://f4d6e7fa2877472ba05d020d1d1b1947@sentry.io/1242105').install();
    Raven.config(document.getElementById("raven_dsn").getAttribute("token")).install();
    let current_word = window.location.pathname.substr(1);

    csrf_token = document.getElementById("csrf").getAttribute("token");

    let dictionary_content = document.getElementsByClassName("dictionary-content");
    Array.prototype.forEach.call(dictionary_content,
        function (element) {
            element.onclick = function () {
                console.log(current_word);
                onbuttonclick(element.id, current_word);
            };
        }
    );

    if (!fetch) { // Let's fall back to get if someone is using some ancient or just a snowflake browser
        let fallback_form = document.getElementById("fallback-form");
        let form = document.getElementById("form");
        form.innerHTML = fallback_form.innerHTML
    }

    document.getElementById("query").onsubmit = function (event) {
        event.preventDefault();
        window.location.href = document.getElementById("query-text").value;
        //console.log(document.getElementById("query-text").value);
    };

    let search_bar = document.getElementById("query-box");
    let search_bar_container = document.getElementById("container");
    let search_bar_offset = search_bar.offsetTop;

    function navbarhandler() {
        if (window.pageYOffset < search_bar_offset) {
            search_bar.classList.remove("sticky");
        } else {
            search_bar.classList.add("sticky");
            search_bar.style.width = search_bar_container.getBoundingClientRect().width + "px";
        }
    }

    window.onscroll = navbarhandler;

    let search_button = document.getElementById("query-submit");
    search_button.onclick = function () {
        window.scrollTo(0, document.getElementById("query-box").offsetTop);
        reset_and_new_search(document.getElementById("query-text").value);
    };

    if (current_word !== "") {
        onbuttonclick("õs", current_word);
        onbuttonclick("seletav", current_word);
        if (navigator.userAgent.includes("Googlebot")) {
            onbuttonclick("wiktionary", current_word);
            onbuttonclick("murdesõnastik", current_word);
            onbuttonclick("vallaste", current_word);
            onbuttonclick("arvutisõnastik", current_word);
        }
        document.getElementById("buttoncontainer").style.display = ""
    } else {
        document.getElementById("buttoncontainer").style.display = "none"
    }

    let report_button = document.getElementById("report");
    report_button.onclick = function () {
        handle_error();
    };

    let contact_button = document.getElementById("contact");
    contact_button.onclick = function () {
        handle_error();
    };
};

function handle_error(error) {
    Raven.captureException(error);
    Raven.showReportDialog();
}

function reset_and_new_search(word) {
    let current_word = word;
    history.pushState({}, "\"" + word + "\" - Sõnaraamatutes", "https://heak.ovh/" + word); // Change URL

    dictionary_state = { // Reset download status
        "õs": "EMPTY",
        "seletav": "EMPTY",
        "wictionary": "EMPTY",
        "murdesõnastik": "EMPTY",
        "vallaste": "EMPTY",
        "arvutisõnastik": "EMPTY",
        "lukus": "EMPTY",
    };

    let dictionary_content = document.getElementsByClassName("dictionary-content");
    Array.prototype.forEach.call(dictionary_content, // Reattach onclick listeners
        function (element) {
            element.innerHTML = "<button>Otsi</button>";
            element.onclick = function () {
                console.log(current_word);
                onbuttonclick(element.id, current_word);
            };
        }
    );

    if (current_word === "") {
        document.getElementById("buttoncontainer").style.display = "none";
    } else {
        document.getElementById("buttoncontainer").style.display = "";
        onbuttonclick("õs", current_word);
        onbuttonclick("seletav", current_word);
    }
}

function getstatus(this_interval, task_id, dictionary) {
    if (dictionary_state[dictionary] === "PENDING") {
        dictionary_state[dictionary] = "DOWNLOADING";
        fetch("/status/" + dictionary + "/" + task_id, {
            headers: {
                method: "GET",
                "X-CSRFToken": csrf_token,
            }
        }).then(function (response) {
            if (response.status !== 200) {
                dictionary_state[dictionary] = "ERROR";
                console.log("Error: " + response.status);
                return null;
            }

            response.json().then(function (data) {
                if (data["status"] === "PENDING") {
                    dictionary_state[dictionary] = "PENDING";
                } else if (data["status"] === "SUCCESS") {
                    dictionary_state[dictionary] = "SUCCESS";
                } else if (data["status"] === "WORKING") {
                    dictionary_state[dictionary] = "PENDING";
                }

                let result = data["state"]["result"];
                if (result === undefined) {
                    result = data["state"];
                }
                if (Array.isArray(result)) {
                    document.getElementById(dictionary).innerHTML = "";
                    result.forEach(function (element) {
                        document.getElementById(dictionary).innerHTML += "<li>" + element + "</li>";
                    });
                } else if (result === "") {
                    document.getElementById(dictionary).innerHTML = "Tulemusi ei leitud";
                } else {
                    document.getElementById(dictionary).innerHTML = result;
                }
                document.getElementById(dictionary).onclick = null;
                console.log(data);
            });

            if (dictionary_state["status"] === "SUCCESS") {
                window.clearInterval(this_interval);
            }
        }).catch(function (error) {
            console.log("Exception occured: " + error);
            // TODO: Give up after some time, not instantly
            window.clearInterval(this_interval);
        });
    } else {
        // Ignore
    }
}

function onbuttonclick(dictionary, word) {
    console.log("Fetching word: " + word);
    fetch("/start/" + dictionary + "/" + word, {
        method: "GET",
        headers: {
            "X-CSRFToken": csrf_token,
        }
    }).then(function (response) {
        if (response.status !== 200) {
            console.log("Error: " + response.status);
            return null;
        }

        response.json().then(function (data) {
            let task_id = data["task_id"];
            registerjobstatuschecker(task_id, dictionary);
            console.log(data);
        })
    }).catch(function (error) {
        console.log("Exception occured: " + error);
    });
}

function registerjobstatuschecker(task_id, dictionary) {
    if (task_id !== null) {
        if (dictionary_state[dictionary] === "EMPTY") {
            setTimeout(function () {
                let this_interval = setInterval(function () {
                    getstatus(this_interval, task_id, dictionary);
                }, 100);
                dictionary_state[dictionary] = "PENDING";
            }, 250);
        }
    } else {
        console.log("Starting task failed!");
    }
}