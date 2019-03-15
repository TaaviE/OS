let csrf_token;

window.onload = function () {
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
    Raven.captureException(error, null);
    Raven.showReportDialog();
}

function reset_and_new_search(word) {
    let current_word = word;
    history.pushState({}, "\"" + word + "\" - Sõnaraamatutes", location.protocol + "//" + document.domain + ":" + location.port + "/" + word); // Change URL


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

function getstatus(task_id, dictionary) {
    fetch("/result/" + dictionary + "/" + task_id, {
        headers: {
            method: "GET",
            "X-CSRFToken": csrf_token,
        }
    }).then(function (response) {
        if (response.status !== 200) {
            console.log("Error: " + response.status);
            return null;
        }

        response.json().then(function (data) {
            let result = data["result"];
            let dictionary_content = document.getElementById(dictionary);

            if (Array.isArray(result) && (result.length > 0)) {
                dictionary_content.innerHTML = "";
                result.forEach(function (element) {
                    dictionary_content.innerHTML += "<li>" + element + "</li>";
                });
            } else if (result === "" || (result !== undefined && result.length === 0)) {
                dictionary_content.innerHTML = "Sobivaid tulemusi ei leitud";
            } else {
                dictionary_content.innerHTML = result;
            }
            document.getElementById(dictionary).onclick = null;
            console.log(data);
        });
    }).catch(function (error) {
        console.log("Exception occured: " + error);
    });
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
            getstatus(task_id, dictionary);
            console.log(data);
        })
    }).catch(function (error) {
        console.log("Exception occured: " + error);
    });
}

