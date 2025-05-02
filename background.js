// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // Set initialized flag to false to trigger default project creation
    chrome.storage.local.set({ initialized: false })
  }
})

// Handle auto-save functionality in the background
let autoSaveInterval = null

// Check auto-save setting and start if enabled
chrome.storage.local.get(["autoSave", "projects"], (data) => {
  if (data.autoSave) {
    startAutoSave()
  }
})

// Listen for changes to auto-save setting
chrome.storage.onChanged.addListener((changes) => {
  if (changes.autoSave) {
    if (changes.autoSave.newValue) {
      startAutoSave()
    } else {
      stopAutoSave()
    }
  }
})

// Start auto-save
function startAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval)
  }

  // Auto-save every 5 minutes
  autoSaveInterval = setInterval(
    () => {
      autoSaveCurrentTabs()
    },
    5 * 60 * 1000,
  )
}

// Stop auto-save
function stopAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval)
    autoSaveInterval = null
  }
}

// Auto-save current tabs
function autoSaveCurrentTabs() {
  const timestamp = new Date().toLocaleTimeString()

  chrome.tabs.query({}, (tabs) => {
    if (tabs.length === 0) return

    chrome.storage.local.get("projects", (data) => {
      const projects = data.projects || []

      const newProject = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: `Auto-Save (${timestamp})`,
        tabs: tabs.map((tab) => ({
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl || "",
        })),
        createdAt: new Date().toISOString(),
        isPinned: false,
        windowId: "all",
      }

      projects.push(newProject)
      chrome.storage.local.set({ projects: projects })
    })
  })
}
