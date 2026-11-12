// Maike site configuration. Edit this file after deploying; nothing else needs to change.
window.MAIKE_CONFIG = {
  // Where leads are POSTed as JSON. Leave empty to keep leads in the browser only (useful while testing).
  // Examples: your Lambda URL from backend/ ("https://xxxx.execute-api.ap-south-1.amazonaws.com/lead"),
  // a Formspree / Web3Forms endpoint, or a Google Apps Script web app (see backend/google-sheet.gs):
  // "https://script.google.com/macros/s/AKfy.../exec"
  leadEndpoint: "https://script.google.com/macros/s/AKfycbwgmPLzRY1eE_lRz7KaM8jgxExYs0A8m9Wh75Bv31r2BOn2QCFiMwy7rpbr_jqMVqD_mA/exec",
  // WhatsApp business number for the "message us" buttons, digits only with country code.
  whatsappNumber: "917379865323",
  city: "Bengaluru",
  // Optional: a Google Analytics / Meta Pixel id. Left empty, nothing loads.
  gaId: "",
};
