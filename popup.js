// Global state
let currentProjects = [];
let autoSaveEnabled = false;
let autoSaveInterval = null;
let currentTabs = [];
let selectedTabs = [];
let editingProjectId = null;
let editingProjectTabs = [];
const AUTO_SAVE_MINUTES = 5;

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
  // Initialize the extension
  initializeExtension();

  // Event listeners for main functionality
  document
    .getElementById('saveTabsBtn')
    .addEventListener('click', saveCurrentTabs);
  document
    .getElementById('createProjectBtn')
    .addEventListener('click', createNewProject);
  document
    .getElementById('toggleAutoSaveBtn')
    .addEventListener('click', toggleAutoSave);
  document
    .getElementById('windowSelector')
    .addEventListener('change', loadCurrentTabs);
  document
    .getElementById('projectNameInput')
    .addEventListener('keypress', (e) => {
      if (e.key === 'Enter') createNewProject();
    });

  // Event listeners for search and sort
  document
    .getElementById('searchInput')
    .addEventListener('input', filterProjects);
  document
    .getElementById('sortSelect')
    .addEventListener('change', sortProjects);

  // Event listeners for adding tabs to existing projects
  document
    .getElementById('addToExistingBtn')
    .addEventListener('click', showProjectSelector);
  document
    .getElementById('cancelAddToExisting')
    .addEventListener('click', hideProjectSelector);
  document
    .getElementById('confirmAddToExisting')
    .addEventListener('click', addSelectedTabsToProject);

  // Event listeners for modal
  document
    .getElementById('closeModal')
    .addEventListener('click', closeTabsModal);
  document
    .getElementById('saveTabChanges')
    .addEventListener('click', saveTabChanges);
});

// Initialize the extension
function initializeExtension() {
  loadProjects();
  populateWindowSelector();
  loadCurrentTabs();

  // Check if this is the first run
  chrome.storage.local.get('initialized', (data) => {
    if (!data.initialized) {
      // Create default project on first install
      createDefaultProject();
      chrome.storage.local.set({ initialized: true });
    }
  });
}

// Create default project
function createDefaultProject() {
  chrome.tabs.query({}, (tabs) => {
    const project = {
      id: generateId(),
      name: 'Default Project',
      tabs: tabs.map((tab) => ({
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl || '',
      })),
      createdAt: new Date().toISOString(),
      isPinned: false,
      windowId: 'all',
    };

    currentProjects.push(project);
    saveProjects();
    renderProjects();
  });
}

// Load projects from storage
function loadProjects() {
  chrome.storage.local.get('projects', (data) => {
    currentProjects = data.projects || [];
    renderProjects();
    populateProjectSelect();
  });

  chrome.storage.local.get('autoSave', (data) => {
    autoSaveEnabled = data.autoSave || false;
    updateAutoSaveButton();

    if (autoSaveEnabled) {
      startAutoSave();
    }
  });
}

// Save projects to storage
function saveProjects() {
  chrome.storage.local.set({ projects: currentProjects });
}

// Populate window selector
function populateWindowSelector() {
  chrome.windows.getAll({ populate: true }, (windows) => {
    const selector = document.getElementById('windowSelector');

    // Clear existing options except "All Windows"
    while (selector.options.length > 1) {
      selector.remove(1);
    }

    // Add window options
    windows.forEach((window, index) => {
      const option = document.createElement('option');
      option.value = window.id;
      option.textContent = `Window ${index + 1} (${window.tabs.length} tabs)`;
      selector.appendChild(option);
    });
  });
}

// Load current tabs
function loadCurrentTabs() {
  const windowId = document.getElementById('windowSelector').value;
  const queryOptions = {};

  if (windowId !== 'all') {
    queryOptions.windowId = Number.parseInt(windowId);
  }

  chrome.tabs.query(queryOptions, (tabs) => {
    currentTabs = tabs;
    renderCurrentTabs();
  });
}

// Render current tabs
function renderCurrentTabs() {
  const tabsList = document.getElementById('currentTabsList');
  tabsList.innerHTML = '';
  selectedTabs = [];

  if (currentTabs.length === 0) {
    tabsList.innerHTML = `<div class="empty-state"><p>No tabs in this window</p></div>`;
    return;
  }

  currentTabs.forEach((tab) => {
    const tabItem = document.createElement('div');
    tabItem.className = 'tab-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'tab-checkbox';
    checkbox.dataset.tabId = tab.id;

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedTabs.push(tab);
      } else {
        selectedTabs = selectedTabs.filter((t) => t.id !== tab.id);
      }

      // Enable/disable the "Add Selected" button based on selection
      document.getElementById('addToExistingBtn').disabled =
        selectedTabs.length === 0;
    });

    const favicon = document.createElement('img');
    favicon.className = 'tab-favicon';
    favicon.src = tab.favIconUrl || 'icons/icon16.png';
    favicon.onerror = () => {
      favicon.src = 'icons/icon16.png';
    };

    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = tab.title;

    tabItem.appendChild(checkbox);
    tabItem.appendChild(favicon);
    tabItem.appendChild(title);

    tabsList.appendChild(tabItem);
  });

  // Initially disable the "Add Selected" button
  document.getElementById('addToExistingBtn').disabled = true;
}

// Show project selector for adding tabs to existing project
function showProjectSelector() {
  if (selectedTabs.length === 0) {
    alert('Please select at least one tab');
    return;
  }

  document.getElementById('existingProjectSelector').classList.remove('hidden');
}

// Hide project selector
function hideProjectSelector() {
  document.getElementById('existingProjectSelector').classList.add('hidden');
}

// Populate project select dropdown
function populateProjectSelect() {
  const select = document.getElementById('projectSelect');
  select.innerHTML = '';

  if (currentProjects.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No projects available';
    select.appendChild(option);
    document.getElementById('confirmAddToExisting').disabled = true;
    return;
  }

  currentProjects.forEach((project) => {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name;
    select.appendChild(option);
  });

  document.getElementById('confirmAddToExisting').disabled = false;
}

// Add selected tabs to existing project
function addSelectedTabsToProject() {
  const projectId = document.getElementById('projectSelect').value;

  if (!projectId) {
    alert('Please select a project');
    return;
  }

  const projectIndex = currentProjects.findIndex((p) => p.id === projectId);

  if (projectIndex === -1) {
    alert('Project not found');
    return;
  }

  // Add selected tabs to the project
  const tabsToAdd = selectedTabs.map((tab) => ({
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl || '',
  }));

  // Check for duplicates
  const existingUrls = new Set(
    currentProjects[projectIndex].tabs.map((tab) => tab.url)
  );
  const newTabs = tabsToAdd.filter((tab) => !existingUrls.has(tab.url));

  if (newTabs.length === 0) {
    alert('All selected tabs are already in this project');
    hideProjectSelector();
    return;
  }

  currentProjects[projectIndex].tabs = [
    ...currentProjects[projectIndex].tabs,
    ...newTabs,
  ];
  saveProjects();
  renderProjects();

  alert(
    `Added ${newTabs.length} tabs to "${currentProjects[projectIndex].name}"`
  );
  hideProjectSelector();

  // Clear selections
  const checkboxes = document.querySelectorAll('.tab-checkbox');
  checkboxes.forEach((cb) => {
    cb.checked = false;
  });
  selectedTabs = [];
  document.getElementById('addToExistingBtn').disabled = true;
}

// Save current tabs as a project
function saveCurrentTabs() {
  const projectName = document.getElementById('projectNameInput').value.trim();
  if (!projectName) {
    alert('Please enter a project name');
    return;
  }

  const windowId = document.getElementById('windowSelector').value;
  const queryOptions = {};

  if (windowId !== 'all') {
    queryOptions.windowId = Number.parseInt(windowId);
  }

  chrome.tabs.query(queryOptions, (tabs) => {
    if (tabs.length === 0) {
      alert('No tabs to save');
      return;
    }

    const project = {
      id: generateId(),
      name: projectName,
      tabs: tabs.map((tab) => ({
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl || '',
      })),
      createdAt: new Date().toISOString(),
      isPinned: false,
      windowId: windowId,
    };

    currentProjects.push(project);
    saveProjects();
    renderProjects();
    populateProjectSelect();

    // Clear input
    document.getElementById('projectNameInput').value = '';
  });
}

// Create a new empty project
function createNewProject() {
  const projectName = document.getElementById('projectNameInput').value.trim();
  if (!projectName) {
    alert('Please enter a project name');
    return;
  }

  const project = {
    id: generateId(),
    name: projectName,
    tabs: [],
    createdAt: new Date().toISOString(),
    isPinned: false,
    windowId: 'all',
  };

  currentProjects.push(project);
  saveProjects();
  renderProjects();
  populateProjectSelect();

  // Clear input
  document.getElementById('projectNameInput').value = '';
}

// Filter projects based on search input
function filterProjects() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const projectCards = document.querySelectorAll('.project-card');

  projectCards.forEach((card) => {
    const projectName = card
      .querySelector('.project-title')
      .textContent.toLowerCase();

    if (projectName.includes(searchTerm)) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
}

// Sort projects
function sortProjects() {
  const sortBy = document.getElementById('sortSelect').value;
  renderProjects(sortBy);
}

// Render projects list
function renderProjects(sortBy = 'newest') {
  const projectsList = document.getElementById('projectsList');
  projectsList.innerHTML = '';

  if (currentProjects.length === 0) {
    projectsList.innerHTML = `
      <div class="empty-state">
        <p>No projects yet</p>
        <p>Save your current tabs as a project to get started</p>
      </div>
    `;
    return;
  }

  // Sort projects based on selected option
  const sortedProjects = [...currentProjects];

  switch (sortBy) {
    case 'newest':
      sortedProjects.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      break;
    case 'oldest':
      sortedProjects.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
      break;
    case 'name':
      sortedProjects.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return a.name.localeCompare(b.name);
      });
      break;
    case 'tabs':
      sortedProjects.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.tabs.length - a.tabs.length;
      });
      break;
  }

  sortedProjects.forEach((project) => {
    const projectCard = document.createElement('div');
    projectCard.className = 'project-card';
    projectCard.dataset.id = project.id;

    const formattedDate = new Date(project.createdAt).toLocaleDateString();
    const tabsText =
      project.tabs.length === 1 ? '1 tab' : `${project.tabs.length} tabs`;

    projectCard.innerHTML = `
      <div class="project-header">
        <div class="project-title">
          ${project.isPinned ? '<span class="pin-icon">📌</span>' : ''}
          ${project.name}
        </div>
        <div class="project-meta">
          ${formattedDate}
        </div>
      </div>
      <div class="tab-count">${tabsText}</div>
      <div class="project-actions">
        <div class="action-buttons">
          <button class="btn primary open-btn">Open All</button>
          <button class="btn secondary new-window-btn">New Window</button>
          <button class="btn secondary view-tabs-btn">View/Edit</button>
        </div>
        <div class="action-buttons">
          <button class="btn secondary pin-btn">${
            project.isPinned ? 'Unpin' : 'Pin'
          }</button>
          <button class="btn secondary rename-btn">Rename</button>
          <button class="btn danger delete-btn">Delete</button>
        </div>
      </div>
    `;

    // Add event listeners
    projectCard
      .querySelector('.open-btn')
      .addEventListener('click', () => openProject(project.id, false));
    projectCard
      .querySelector('.new-window-btn')
      .addEventListener('click', () => openProject(project.id, true));
    projectCard
      .querySelector('.view-tabs-btn')
      .addEventListener('click', () => openTabsModal(project.id));
    projectCard
      .querySelector('.pin-btn')
      .addEventListener('click', () => togglePinProject(project.id));
    projectCard
      .querySelector('.rename-btn')
      .addEventListener('click', () =>
        startRenameProject(projectCard, project.id)
      );
    projectCard
      .querySelector('.delete-btn')
      .addEventListener('click', () => deleteProject(project.id));

    projectsList.appendChild(projectCard);
  });
}

// Open tabs modal to view and edit project tabs
function openTabsModal(projectId) {
  const project = currentProjects.find((p) => p.id === projectId);
  if (!project) return;

  editingProjectId = projectId;
  editingProjectTabs = [...project.tabs];

  const modal = document.getElementById('tabsModal');
  const modalTitle = document.getElementById('modalProjectName');
  const tabsList = document.getElementById('modalTabsList');

  modalTitle.textContent = `${project.name} (${project.tabs.length} tabs)`;
  tabsList.innerHTML = '';

  if (project.tabs.length === 0) {
    tabsList.innerHTML = `<div class="empty-state"><p>No tabs in this project</p></div>`;
  } else {
    project.tabs.forEach((tab, index) => {
      const tabItem = document.createElement('div');
      tabItem.className = 'modal-tab-item';

      const favicon = document.createElement('img');
      favicon.className = 'modal-tab-favicon';
      favicon.src = tab.favIconUrl || 'icons/icon16.png';
      favicon.onerror = () => {
        favicon.src = 'icons/icon16.png';
      };

      const title = document.createElement('div');
      title.className = 'modal-tab-title';
      title.textContent = tab.title;
      title.title = tab.url;
      title.target = '_blank';
      title.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: tab.url });
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'modal-tab-remove';
      removeBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
      removeBtn.addEventListener('click', () => {
        editingProjectTabs.splice(index, 1);
        tabItem.remove();
        modalTitle.textContent = `${project.name} (${editingProjectTabs.length} tabs)`;
      });

      tabItem.appendChild(favicon);
      tabItem.appendChild(title);
      tabItem.appendChild(removeBtn);

      tabsList.appendChild(tabItem);
    });
  }

  modal.style.display = 'block';
}

// Close tabs modal
function closeTabsModal() {
  document.getElementById('tabsModal').style.display = 'none';
  editingProjectId = null;
  editingProjectTabs = [];
}

// Save tab changes
function saveTabChanges() {
  if (!editingProjectId) return;

  const projectIndex = currentProjects.findIndex(
    (p) => p.id === editingProjectId
  );
  if (projectIndex === -1) return;

  currentProjects[projectIndex].tabs = editingProjectTabs;
  saveProjects();
  renderProjects();

  closeTabsModal();
}

// Open a project
function openProject(projectId, inNewWindow) {
  const project = currentProjects.find((p) => p.id === projectId);
  if (!project || project.tabs.length === 0) return;

  if (inNewWindow) {
    // Open first tab to create a new window, then add the rest
    chrome.windows.create({ url: project.tabs[0].url }, (newWindow) => {
      // Open remaining tabs in the new window
      for (let i = 1; i < project.tabs.length; i++) {
        chrome.tabs.create({
          windowId: newWindow.id,
          url: project.tabs[i].url,
          active: false,
        });
      }
    });
  } else {
    // Open tabs in current window
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];

      // Open first tab by updating current tab
      chrome.tabs.update(currentTab.id, { url: project.tabs[0].url });

      // Open remaining tabs
      for (let i = 1; i < project.tabs.length; i++) {
        chrome.tabs.create({
          url: project.tabs[i].url,
          active: false,
        });
      }
    });
  }
}

// Toggle pin status for a project
function togglePinProject(projectId) {
  const projectIndex = currentProjects.findIndex((p) => p.id === projectId);
  if (projectIndex === -1) return;

  currentProjects[projectIndex].isPinned =
    !currentProjects[projectIndex].isPinned;
  saveProjects();
  renderProjects();
}

// Start renaming a project
function startRenameProject(projectCard, projectId) {
  const project = currentProjects.find((p) => p.id === projectId);
  if (!project) return;

  const titleElement = projectCard.querySelector('.project-title');
  const currentName = project.name;

  titleElement.classList.add('editing');
  titleElement.innerHTML = `<input type="text" value="${currentName}" class="rename-input">`;

  const input = titleElement.querySelector('input');
  input.focus();
  input.select();

  // Handle input blur and enter key
  input.addEventListener('blur', () =>
    finishRenameProject(projectId, input.value)
  );
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      finishRenameProject(projectId, input.value);
    }
  });
}

// Finish renaming a project
function finishRenameProject(projectId, newName) {
  newName = newName.trim();
  if (!newName) return;

  const projectIndex = currentProjects.findIndex((p) => p.id === projectId);
  if (projectIndex === -1) return;

  currentProjects[projectIndex].name = newName;
  saveProjects();
  renderProjects();
  populateProjectSelect();
}

// Delete a project
function deleteProject(projectId) {
  if (!confirm('Are you sure you want to delete this project?')) return;

  const projectIndex = currentProjects.findIndex((p) => p.id === projectId);
  if (projectIndex === -1) return;

  currentProjects.splice(projectIndex, 1);
  saveProjects();
  renderProjects();
  populateProjectSelect();
}

// Toggle auto-save
function toggleAutoSave() {
  autoSaveEnabled = !autoSaveEnabled;
  chrome.storage.local.set({ autoSave: autoSaveEnabled });

  if (autoSaveEnabled) {
    startAutoSave();
  } else {
    stopAutoSave();
  }

  updateAutoSaveButton();
}

// Start auto-save
function startAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
  }

  autoSaveInterval = setInterval(() => {
    autoSaveCurrentTabs();
  }, AUTO_SAVE_MINUTES * 60 * 1000);
}

// Stop auto-save
function stopAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}

// Auto-save current tabs
function autoSaveCurrentTabs() {
  const timestamp = new Date().toLocaleTimeString();

  chrome.tabs.query({}, (tabs) => {
    if (tabs.length === 0) return;

    const project = {
      id: generateId(),
      name: `Auto-Save (${timestamp})`,
      tabs: tabs.map((tab) => ({
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl || '',
      })),
      createdAt: new Date().toISOString(),
      isPinned: false,
      windowId: 'all',
    };

    currentProjects.push(project);
    saveProjects();

    // Update UI if popup is open
    if (document.getElementById('projectsList')) {
      renderProjects();
      populateProjectSelect();
    }
  });
}

// Update auto-save button text
function updateAutoSaveButton() {
  const button = document.getElementById('toggleAutoSaveBtn');
  button.textContent = autoSaveEnabled
    ? `Auto-Save: On (${AUTO_SAVE_MINUTES}m)`
    : 'Auto-Save: Off';
}

// Generate a unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}
