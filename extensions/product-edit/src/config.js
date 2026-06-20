// extensions/product-edit/src/config.js
//
// Extension-side app handle config.
//
// Admin Extensions run in a sandboxed browser environment — process.env and
// Node modules are unavailable. This file holds the build-time constant that
// the extension needs. Keep the value in sync with SHOPIFY_APP_HANDLE in your
// .env / deployment config and with app/config.js in the Remix app.
//
// NEVER inline this value at the call-site (spec §1.3).

/** @type {string} */
export const APP_HANDLE = "mytask-products-app";