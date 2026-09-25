export type SnippetLanguage = 'javascript' | 'p5';

// Keep model files separate so the ZIP works with existing TensorFlow.js apps.
export function modelExample(language: SnippetLanguage): string {
  const p5 = language === 'p5';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>My image model</title>
  <style>
    body { font: 16px system-ui; padding: 20px; margin: auto; max-width: 600px; }
    button { font: inherit; padding: 12px 20px; margin: 0 8px 16px 0; }
    canvas { max-width: 100%; border-radius: 12px; }
    #label-container { margin-top: 16px; line-height: 1.8; }
  </style>
</head>
<body>
  <h1>My image model</h1>
  <button id="start" type="button">Start camera</button>
  <button id="stop" type="button" disabled>Stop</button>
  <p id="status" role="status">Ready to start.</p>
  <div id="webcam-container"></div>
  <div id="label-container"></div>
  <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.5/dist/teachablemachine-image.min.js"></script>${p5 ? '\n  <script src="https://cdn.jsdelivr.net/npm/p5@1.11.11/lib/p5.min.js"></script>' : ''}
  <script>
    // Unzip model.json, weights.bin, and metadata.json into my_model/.
    // Serve this HTML and that folder over HTTPS, or localhost on a computer.
    // Opening this HTML directly as a file will not load the model.
    const MODEL_URL = "./my_model/";
    const startButton = document.getElementById("start");
    const stopButton = document.getElementById("stop");
    const status = document.getElementById("status");
    const labelContainer = document.getElementById("label-container");
    let model, webcam;
    let session = 0;
${
  p5
    ? `
    function setup() {
      createCanvas(224, 224).parent("webcam-container");
      frameRate(24);
      background(245);
      noLoop();
    }

    function draw() {
      if (webcam) drawingContext.drawImage(webcam.canvas, 0, 0, width, height);
    }
`
    : ''
}
    async function start() {
      const run = ++session;
      startButton.disabled = true;
      stopButton.disabled = false;
      status.textContent = "Loading model and opening camera…";
      let camera;
      try {
        model ??= await tmImage.load(MODEL_URL + "model.json", MODEL_URL + "metadata.json");
        if (run !== session) return;
        camera = new tmImage.Webcam(224, 224, false);
        await camera.setup({ facingMode: "environment" });
        if (run !== session) { camera.stop(); return; }
        camera.webcam.setAttribute("playsinline", "");
        await camera.play();
        if (run !== session) { camera.stop(); return; }
        webcam = camera;
${p5 ? '        loop();' : '        document.getElementById("webcam-container").replaceChildren(webcam.canvas);'}
        labelContainer.replaceChildren();
        for (const label of model.getClassLabels()) {
          const row = document.createElement("div");
          row.textContent = label;
          labelContainer.appendChild(row);
        }
        status.textContent = "Camera running. Try your model.";
        void predict(run);
      } catch (error) {
        if (camera?.webcam?.srcObject) camera.stop();
        if (run !== session) return;
        stop();
        status.textContent = "Could not start: " + (error.message || error);
      }
    }

    async function predict(run) {
      if (!webcam || run !== session) return;
      try {
        webcam.update();
        const predictions = await model.predict(webcam.canvas);
        if (run !== session) return;
        predictions.forEach((prediction, index) => {
          labelContainer.children[index].textContent =
            prediction.className + ": " + (prediction.probability * 100).toFixed(1) + "%";
        });
        requestAnimationFrame(() => void predict(run));
      } catch (error) {
        if (run !== session) return;
        stop();
        status.textContent = "Prediction failed: " + (error.message || error);
      }
    }

    function stop() {
      session++;
      if (webcam?.webcam?.srcObject) webcam.stop();
      webcam = undefined;
${p5 ? '      noLoop();' : '      document.getElementById("webcam-container").replaceChildren();'}
      startButton.disabled = false;
      stopButton.disabled = true;
      status.textContent = "Camera stopped. Tap Start camera to resume.";
    }

    startButton.addEventListener("click", start);
    stopButton.addEventListener("click", stop);
    window.addEventListener("pagehide", stop);
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  </script>
</body>
</html>
`;
}
