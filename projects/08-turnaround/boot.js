(() => {
  const script = document.createElement("script");
  if (location.protocol === "file:") {
    script.src = "./offline.js";
  } else {
    script.type = "module";
    script.src = "./app.mjs";
  }
  script.onerror = () => {
    document.getElementById("boot-message").textContent =
      "The local application could not load. Keep its files together, or read README.md and results/scenarios.json. No remote fallback is used.";
  };
  document.head.append(script);
})();
