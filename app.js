//------- ELEMENTS SECTION -------
const elements = {
    //buttons
    btnMinus: document.getElementById("btnMinus"),
    btnPlus: document.getElementById("btnPlus"),
    btnStart: document.getElementById("btnStart"),
    btnSetTruck: document.getElementById("btnSetTruck"),
    btnSetGrave: document.getElementById("btnSetGrave"),
    btnResetCalibration: document.getElementById("btnResetCalibration"),
    btnNewGrave: document.getElementById("btnNewGrave"),
    //text
    counterValue: document.getElementById("counterValue"),
    instructionText: document.getElementById("instructionText"),
    truck: document.getElementById("truck"),
    truckHeadingLabel: document.getElementById("truckHeadingLabel"),
    grave: document.getElementById("grave"),
    graveHeadingLabel: document.getElementById("graveHeadingLabel"),
    status: document.getElementById("status"),
    statusLabel: document.getElementById("statusLabel"),
    heading: document.getElementById("heading"),
    headingLabel: document.getElementById("headingLabel"),
};

//------- STATE SECTION -------
//defaults (never change)
const initialState = {
    counter: 0,
    hasActivated: false, //becomes true after start
    isRunning: false, //toggled by the pause/resume button
    truckHeading: "—",
    graveHeading: "—"
};

//live state
let state = { ...initialState };

//------- FUNCTIONS SECTION -------

function changeAmount(amount) {
    state.counter += amount;
    if (state.counter < 0) state.counter = 0;
    elements.counterValue.textContent = state.counter;
}

function showUi() {
    //unhide ui
    elements.truck.classList.remove("hidden");
    elements.btnSetTruck.classList.remove("hidden");
    elements.grave.classList.remove("hidden");
    elements.btnSetGrave.classList.remove("hidden");
    elements.btnResetCalibration.classList.remove("hidden");
    elements.status.classList.remove("hidden");
    elements.heading.classList.remove("hidden");
    elements.btnNewGrave.classList.remove("hidden");
    //change words
    elements.instructionText.innerText = "Initializing sensors...";
    elements.statusLabel.innerText = "Initializing sensors...";
}

//change pause/resume button color
function updateStartButtonUi() {
    if (!state.hasActivated) {
        elements.btnStart.textContent = "Start";
        elements.btnStart.className = "w-full p-2 text-md font-medium bg-accent rounded";
    }
    else if (state.isRunning) {
        elements.btnStart.textContent = "Pause";
        elements.btnStart.className = "w-full p-2 text-md font-medium bg-danger rounded";
    } else {
        elements.btnStart.textContent = "Resume";
        elements.btnStart.className = "w-full p-2 text-md font-medium bg-accent rounded";
    }
};

function resetState() {
    state = { ...initialState };
}

function renderUi() {
    elements.counterValue.innerText = state.counter;
    elements.instructionText.innerText = "Press Start to enable motion detection. Then set Grave and Truck positions.";
    elements.statusLabel.innerText = "Idle";
    elements.truckHeadingLabel.innerText = state.truckHeading;
    elements.graveHeadingLabel.innerText = state.graveHeading;

    //rehide ui
    elements.truck.classList.add("hidden");
    elements.btnSetTruck.classList.add("hidden");
    elements.grave.classList.add("hidden");
    elements.btnSetGrave.classList.add("hidden");
    elements.btnResetCalibration.classList.add("hidden");
    elements.status.classList.add("hidden");
    elements.heading.classList.add("hidden");
    elements.btnNewGrave.classList.add("hidden");

    updateStartButtonUi();
}

//reset UI
function resetUi() {
    resetState();
    renderUi();
};

function onDeviceOrientation(event) {
    state.heading = event.alpha || 0;
    elements.headingLabel.innerText = Math.round(state.heading);
}

async function startOrientation() {
    // ask permission (iOS)
    let granted = true;
    if (DeviceOrientationEvent?.requestPermission) {
        granted = (await DeviceOrientationEvent.requestPermission()) === "granted";
    }

    if (!granted) {
        elements.statusLabel.innerText = "Permission denied!";
        return;
    }

    // start listening
    window.addEventListener("deviceorientation", onDeviceOrientation);

    elements.statusLabel.innerText = "Detecting...";
}

function stopOrientation() {
    window.removeEventListener("deviceorientation", onDeviceOrientation);
}
//------- EVENTS SECTION -------

//add .5 to counter
elements.btnPlus.addEventListener("click", (e) => {
    e.preventDefault(); //prevent default browser behavior (zooming on double click)
    changeAmount(.5)
});

//subtract .5 from counter
elements.btnMinus.addEventListener("click", (e) => {
    e.preventDefault(); //prevent default browser behavior (zooming on double click)
    changeAmount(-.5)
});

//show hidden elements on start button click
elements.btnStart.addEventListener("click", () => {
    if (!state.hasActivated) {
        state.hasActivated = true;
        state.isRunning = true;
        showUi();
        updateStartButtonUi();
        startOrientation(); //request permissions and start reading heading
    } else if (state.isRunning) {
        //pause
        state.isRunning = false;
        stopOrientation(); //remove event listener
        updateStartButtonUi();
    } else {
        //resume
        state.isRunning = true;
        updateStartButtonUi();
        startOrientation();
    }
});

//reset UI on new grave click
elements.btnNewGrave.addEventListener("click", () => {
    resetUi();
});
