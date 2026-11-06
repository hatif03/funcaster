const frame = document.getElementById("sandbox"),
  source = document.getElementById("source"),
  status = document.getElementById("creator-status");
document.getElementById("preview").onclick = () => {
  if (source.value.length > 200000) {
    status.textContent = "Keep the preview under 200 KB.";
    return;
  }
  frame.srcdoc =
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'">` +
    source.value;
  status.textContent = "Preview ready. Move the sliders to try the pointer.";
};
function sendInput() {
  frame.contentWindow.postMessage(
    {
      type: "chonks:input",
      x: Number(document.getElementById("preview-x").value),
      y: Number(document.getElementById("preview-y").value),
    },
    "*",
  );
}
for (const id of ["preview-x", "preview-y"])
  document.getElementById(id).addEventListener("input", sendInput);
frame.addEventListener("load", sendInput);
