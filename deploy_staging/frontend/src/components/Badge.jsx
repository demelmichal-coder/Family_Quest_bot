// Badge.jsx - Komponenta pro odznaky
import React from "react";

/**
 * Komponenta pro zobrazení odznaku
 * @param {string} icon - Emoji nebo SVG ikona
 * @param {string} label - Název odznaku
 * @param {string} desc - Popis/milník
 * @param {boolean} achieved - Zda je odznak získán
 */
const Badge = ({ icon, label, desc, achieved }) => (
  <div className={`badge-card ${achieved ? "achieved" : ""}`} title={desc}>
    <div className="badge-icon">{icon}</div>
    <div className="badge-label">{label}</div>
  </div>
);

export default Badge;
