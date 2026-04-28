const videoEl = document.getElementById("cam");
const canvasEl = document.getElementById("overlay");
const ctx = canvasEl.getContext("2d");

const catLayer = document.getElementById("catLayer");
const systemStateEl = document.getElementById("systemState");
const palmStateEl = document.getElementById("palmState");
const motionStateEl = document.getElementById("motionState");
const switchStateEl = document.getElementById("switchState");

let lastLogged = new Map();

function sendLog(message) {
  fetch("/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  }).catch(() => {});
}

function throttledLog(key, message, cooldown = 700) {
  const now = Date.now();
  const prev = lastLogged.get(key) || 0;

  if (now - prev >= cooldown) {
    lastLogged.set(key, now);
    sendLog(message);
  }
}

function setSystemState(text) {
  systemStateEl.textContent = `SYSTEM: ${text}`;
}

function setPalmState(text) {
  palmStateEl.textContent = `PALM: ${text}`;
}

function setMotionState(text) {
  motionStateEl.textContent = `MOTION: ${text}`;
}

function setSwitchState(num) {
  switchStateEl.textContent = `SWITCH: ${num}`;
}

function resizeCanvas() {
  canvasEl.width = videoEl.videoWidth || window.innerWidth;
  canvasEl.height = videoEl.videoHeight || window.innerHeight;
}

window.addEventListener("resize", resizeCanvas);

let catTimeouts = [];

function clearCatTimeouts() {
  catTimeouts.forEach((id) => clearTimeout(id));
  catTimeouts = [];
}

function spawnCats() {
  clearCatTimeouts();
  catLayer.innerHTML = "";

  const cats = [
    {
      src: "./cat.mp4",
      top: "18%",
      left: "6%",
      delay: 0,
      className: "cat-pop side-left"
    },
    {
      src: "./cat1.mp4",
      top: "18%",
      right: "6%",
      delay: 0,
      className: "cat-pop side-right"
    },
    {
      src: "./cat2.mp4",
      bottom: "6%",
      left: "50%",
      delay: 260,
      className: "cat-pop center-bottom"
    }
  ];

  cats.forEach((item) => {
    const timer = setTimeout(() => {
      const vid = document.createElement("video");

      vid.src = item.src;
      vid.muted = true;
      vid.loop = true;
      vid.autoplay = true;
      vid.playsInline = true;
      vid.className = item.className;

      Object.assign(vid.style, {
        top: item.top || "",
        left: item.left || "",
        right: item.right || "",
        bottom: item.bottom || "",
        display: "block"
      });

      catLayer.appendChild(vid);
      vid.play().catch(() => {});
    }, item.delay);

    catTimeouts.push(timer);
  });
}

function clearCats() {
  clearCatTimeouts();
  catLayer.innerHTML = "";
}

let systemReady = false;
let catVisible = false;

let motionHandIndex = 0;
let lastX = null;
let lastDirection = null;
let directionSwitchCount = 0;

const MOVE_THRESHOLD = 0.045;
const REQUIRED_SWITCHES = 2;

function resetGestureState() {
  lastX = null;
  lastDirection = null;
  directionSwitchCount = 0;
  setSwitchState(0);
  setMotionState("-");
}

function detectOpenPalm(landmarks, handedness = "Right") {
  const tipIds = [8, 12, 16, 20];
  const pipIds = [6, 10, 14, 18];

  let openCount = 0;

  for (let i = 0; i < tipIds.length; i++) {
    const tip = landmarks[tipIds[i]];
    const pip = landmarks[pipIds[i]];

    if (tip.y < pip.y) {
      openCount++;
    }
  }

  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];

  let thumbOpen = false;

  if (handedness === "Right") {
    thumbOpen = thumbTip.x < thumbIp.x;
  } else {
    thumbOpen = thumbTip.x > thumbIp.x;
  }

  return openCount >= 3 && thumbOpen;
}

function detectFist(landmarks) {
  const tipIds = [8, 12, 16, 20];
  const pipIds = [6, 10, 14, 18];

  let closedCount = 0;

  for (let i = 0; i < tipIds.length; i++) {
    const tip = landmarks[tipIds[i]];
    const pip = landmarks[pipIds[i]];

    if (tip.y > pip.y + 0.02) {
      closedCount++;
    }
  }

  return closedCount >= 4;
}

function updateMotionFromX(currentX) {
  if (lastX === null) {
    lastX = currentX;
    return;
  }

  const dx = currentX - lastX;
  let currentDirection = null;

  if (dx > MOVE_THRESHOLD) {
    currentDirection = "RIGHT";
  } else if (dx < -MOVE_THRESHOLD) {
    currentDirection = "LEFT";
  }

  if (!currentDirection) return;

  setMotionState(currentDirection);
  throttledLog(
    "motion-" + currentDirection,
    "motion " + currentDirection.toLowerCase(),
    250
  );

  if (lastDirection && currentDirection !== lastDirection) {
    directionSwitchCount++;
    setSwitchState(directionSwitchCount);
  }

  lastDirection = currentDirection;
  lastX = currentX;

  if (systemReady && !catVisible && directionSwitchCount >= REQUIRED_SWITCHES) {
    spawnCats();
    catVisible = true;
    directionSwitchCount = 0;
    setSwitchState(0);
    setSystemState("PLAYING");
    sendLog("cats spawned");
  }
}

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 0,
  minDetectionConfidence: 0.55,
  minTrackingConfidence: 0.55
});

hands.onResults((results) => {
  resizeCanvas();
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  if (results.image) {
    ctx.save();
    ctx.drawImage(results.image, 0, 0, canvasEl.width, canvasEl.height);
    ctx.restore();
  }

  const allHands = results.multiHandLandmarks || [];
  const allHandedness = results.multiHandedness || [];

  if (allHands.length === 0) {
    setPalmState("NONE");
    return;
  }

  ctx.shadowColor = "rgba(0,255,140,0.25)";
  ctx.shadowBlur = 3;

  allHands.forEach((handLandmarks) => {
    drawConnectors(ctx, handLandmarks, HAND_CONNECTIONS, {
      color: "#00ff99",
      lineWidth: 1
    });

    drawLandmarks(ctx, handLandmarks, {
      color: "#7fffd4",
      lineWidth: 1,
      radius: 2
    });
  });

  ctx.shadowBlur = 0;

  const handStates = allHands.map((landmarks, i) => {
    const handedness = allHandedness[i]?.label || "Right";

    return {
      index: i,
      open: detectOpenPalm(landmarks, handedness),
      fist: detectFist(landmarks),
      landmarks
    };
  });

  const openHands = handStates.filter((h) => h.open);
  const fistDetected = handStates.some((h) => h.fist);

  if (!systemReady && openHands.length >= 2) {
    systemReady = true;
    motionHandIndex = openHands[0].index;
    resetGestureState();
    setPalmState("OPEN OPEN");
    setSystemState("READY");
    sendLog("double palm ready");
    return;
  }

  if (fistDetected) {
    setPalmState("FIST");

    if (catVisible) {
      clearCats();
      catVisible = false;
      sendLog("cats cleared");
    }

    systemReady = false;
    resetGestureState();
    setSystemState("IDLE");
    return;
  }

  if (openHands.length >= 2) {
    setPalmState("OPEN OPEN");
  } else if (openHands.length === 1) {
    setPalmState("ONE OPEN");
  } else {
    setPalmState("OTHER");
  }

  if (catVisible) {
    return;
  }

  if (systemReady) {
    const primary = allHands[motionHandIndex];

    if (!primary) return;

    const wrist = primary[0];
    updateMotionFromX(wrist.x);
  }
});

async function startApp() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: 256,
        height: 192,
        frameRate: { ideal: 10, max: 12 },
        facingMode: "user"
      },
      audio: false
    });

    videoEl.srcObject = stream;
    await videoEl.play();

    resizeCanvas();
    sendLog("camera ready");

    let lastProcessTime = 0;
    const PROCESS_INTERVAL = 90;

    const camera = new Camera(videoEl, {
      onFrame: async () => {
        const now = Date.now();

        if (now - lastProcessTime < PROCESS_INTERVAL) return;

        lastProcessTime = now;
        await hands.send({ image: videoEl });
      },
      width: 256,
      height: 192
    });

    camera.start();
  } catch (err) {
    console.error(err);
    setSystemState("CAMERA ERROR");
    sendLog("camera error");
    alert("Kamera gagal dibuka. Cek izin browser.");
  }
}

startApp(); 
