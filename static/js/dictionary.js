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
                console.log(window.location.pathname);
                onbuttonclick(element.id, current_word);
            };
        }
    );
    document.getElementById("query").onsubmit = function (event) {
        event.preventDefault();
        window.location.href = document.getElementById("query-text").value;
        //console.log(document.getElementById("query-text").value);
    };

    onbuttonclick("õs", current_word);
    onbuttonclick("seletav", current_word);
};

function handleRouteError(err) {
    Raven.captureException(err);
    Raven.showReportDialog();
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
            }, 10);
        }
    } else {
        console.log("Starting task failed!");
    }
}