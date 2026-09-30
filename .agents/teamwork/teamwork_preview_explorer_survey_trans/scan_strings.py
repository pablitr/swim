import os
import re
import json

CODEBASE_DIR = "/home/pablito/emprende/swimcoach_tracker"

# Target files
TARGET_FILES = [
    "index.html",
    "manifest.json",
    "sw.js",
    "css/reset.css",
    "css/variables.css",
    "css/styles.css",
    "js/app.js",
    "js/ui/swimmer-card.js",
    "js/ui/metrics-modal.js",
    "js/ui/modal.js",
    "js/ui/boxplot-svg.js",
    "js/timing/timer-engine.js",
    "js/timing/ticker.js",
    "js/storage/repository.js",
    "js/storage/db.js",
    "js/analytics/zones.js",
    "js/analytics/stats.js",
    "js/analytics/pace-calculator.js"
]

print("Scanning target files for strings...")

# Look for string literals in JS
# Also look for innerHTML template literals
for rel_path in TARGET_FILES:
    full_path = os.path.join(CODEBASE_DIR, rel_path)
    if not os.path.exists(full_path):
        continue
    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()
        lines = content.splitlines()

    print(f"\n--- {rel_path} ({len(lines)} lines) ---")
    
    # Check for HTML attributes and text
    if rel_path.endswith(".html"):
        for i, line in enumerate(lines, 1):
            # check for english words
            # e.g., common english UI words
            for attr in ["placeholder", "title", "aria-label", "alt", "value"]:
                m = re.findall(rf'{attr}=["\']([^"\']+)["\']', line)
                if m:
                    for val in m:
                        print(f"  Line {i}: [{attr}] {val}")
            # check tag text
            text_matches = re.findall(r'>([^<]+)<', line)
            for tm in text_matches:
                t = tm.strip()
                if t and not t.startswith("&") and len(t) > 1:
                    print(f"  Line {i}: [text] {t}")
    
    elif rel_path.endswith(".json"):
        for i, line in enumerate(lines, 1):
            for key in ["name", "short_name", "description"]:
                m = re.findall(rf'"{key}"\s*:\s*"([^"]+)"', line)
                if m:
                    for val in m:
                        print(f"  Line {i}: [{key}] {val}")

    elif rel_path.endswith(".js"):
        for i, line in enumerate(lines, 1):
            # look for alert, confirm, prompt
            if "alert(" in line or "confirm(" in line or "prompt(" in line:
                print(f"  Line {i}: [dialog] {line.strip()}")
            # look for aria-label, title, placeholder, textContent, innerHTML
            if any(k in line for k in ["aria-label", "title", "placeholder", "textContent", "innerHTML", "innerText"]):
                print(f"  Line {i}: [DOM/UI] {line.strip()}")
            # look for throw new Error
            if "throw new Error" in line or "throw new TypeError" in line:
                print(f"  Line {i}: [Error] {line.strip()}")
            # look for console.log/warn/error that might be user-facing or relevant
            if "console." in line:
                print(f"  Line {i}: [Console] {line.strip()}")
            # look for svg text elements
            if "<text" in line or "role=\"img\"" in line or "aria-label=" in line:
                print(f"  Line {i}: [SVG-UI] {line.strip()}")
