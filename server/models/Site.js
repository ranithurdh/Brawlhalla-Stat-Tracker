import mongoose from "mongoose";

// Look of the site: the tab icon and the page background. Images are stored as
// data URLs (the browser shrinks them first) and served by routes/site.js.
const SiteSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "main" },
  favicon: { type: String, default: "" },
  faviconAt: { type: Date, default: null },
  background: { type: String, default: "" },
  backgroundAt: { type: Date, default: null },
  // How solid the colour layer on top of the background image is (0 to 1).
  // Lower shows more of the image.
  overlayOpacity: { type: Number, default: 0.85, min: 0, max: 1 },
});

export default mongoose.model("Site", SiteSchema);
