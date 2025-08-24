// Broadcast channel for local tab sync
let channel = null;
if ('BroadcastChannel' in window) {
  channel = new BroadcastChannel('auctionChannel');
}

// State with default values
const defaultState = {
  candidates: [],
  teams: [],
  auction: {
    status: 'not_started',
    currentClass: '1',  // Changed to string for consistency
    currentTeamIndex: 0,
    turnOrder: [],
    selections: [],
    pendingRequest: null,
    lastSelection: null,
    turnStartTime: null,
    stateVersion: 0
  }
};
let state = {...defaultState};
let lastStateVersion = 0;

// User state per tab (stored in sessionStorage)
const defaultUserState = { role: '', team: '' };
let userState = {...defaultUserState};

// Timer variables
let timerInterval = null;
const TURN_DURATION = 30; // seconds

/* ======================
   DATABASE OPERATIONS (USING LOCALSTORAGE)
   ====================== */

async function loadState() {
  try {
    const localData = localStorage.getItem('appState');
    if (localData) {
      const data = JSON.parse(localData);
      if (data && data.auction.stateVersion > lastStateVersion) {
        state = {
          ...defaultState,
          ...data,
          auction: {
            ...defaultState.auction,
            ...data.auction
          }
        };
        lastStateVersion = state.auction.stateVersion;
        console.log('State loaded from localStorage:', state);
      } else {
        console.log('Skipped state load: no new changes');
      }
    } else {
      console.log('No data in localStorage, using default state');
    }
  } catch (e) {
    console.error('LocalStorage load error:', e);
    alert('Error loading local data. Try clearing browser storage.');
  }
}

async function saveState(silent = true) {
  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    state.auction.stateVersion = (state.auction.stateVersion || 0) + 1;
    localStorage.setItem('appState', JSON.stringify(state));
    console.log('State saved to localStorage:', state);
    if (channel) {
      channel.postMessage('update');
    }
  } catch (e) {
    console.error('Error saving to localStorage:', e);
    if (!silent) alert('Failed to save data locally.');
  }
}

function loadUserState() {
  const saved = sessionStorage.getItem('userState');
  if (saved) {
    userState = JSON.parse(saved);
    console.log('User state loaded from sessionStorage:', userState);
  }
}

function saveUserState() {
  sessionStorage.setItem('userState', JSON.stringify(userState));
  console.log('User state saved to sessionStorage:', userState);
}

/* ======================
   USER MANAGEMENT
   ====================== */

async function selectRole(role) {
  if (role === 'admin') {
    const adminPasswordSelection = document.getElementById('admin-password-selection');
    if (adminPasswordSelection) {
      adminPasswordSelection.style.display = 'block';
    }
  } else if (role === 'leader') {
    const leaderTeamSelection = document.getElementById('leader-team-selection');
    if (leaderTeamSelection) {
      leaderTeamSelection.style.display = 'block';
      const teamSelect = document.getElementById('team-select');
      if (teamSelect) {
        teamSelect.innerHTML = '<option value="">Choose a team</option>';
        state.teams.forEach(team => {
          const option = document.createElement('option');
          option.value = team.name;
          option.textContent = team.name;
          teamSelect.appendChild(option);
        });
      }
    }
  } else {
    userState.role = role;
    userState.team = '';
    saveUserState();
    navigateToRolePage(role);
  }
}



async function confirmAdminPassword() {
  const passwordInput = document.getElementById('admin-password');
  if (passwordInput) {
    if (passwordInput.value === 'admin007') {
      userState.role = 'admin';
      userState.team = '';
      saveUserState();
      navigateToRolePage('admin');
    } else {
      alert('Incorrect password');
    }
  }
}

async function confirmLeaderTeam() {
  const teamSelect = document.getElementById('team-select');
  if (teamSelect) {
    userState.team = teamSelect.value;
    if (!userState.team) {
      alert('Please select a team.');
      return;
    }
    userState.role = 'leader';
    saveUserState();
    navigateToRolePage('leader');
  }
}

function navigateToRolePage(role) {
  const pages = {
    admin: 'admin.html',
    leader: 'leader.html',
    audience: 'audience.html'
  };
  window.location.href = pages[role];
}

async function logout() {
  userState = {...defaultUserState};
  saveUserState();
  window.location.href = 'index.html';
}

// Expose role functions globally for index.html buttons
window.selectRole = selectRole;
window.confirmAdminPassword = confirmAdminPassword;
window.confirmLeaderTeam = confirmLeaderTeam;
window.logout = logout;


/* ======================
   ADMIN FUNCTIONS
   ====================== */

async function initAdmin() {
  await loadState();
  loadUserState();
  const candidateForm = document.getElementById('candidate-form');
  if (candidateForm) {
    candidateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('candidate-name');
      const classInput = document.getElementById('candidate-class');
      const admissionNumberInput = document.getElementById('candidate-admission-number');
      const imageInput = document.getElementById('candidate-image');
      
      if (!nameInput || !classInput || !admissionNumberInput) {
        alert('Form elements missing.');
        return;
      }
      
      const name = nameInput.value.trim();
      const classNum = classInput.value;  // String
      const admissionNumber = admissionNumberInput.value.trim();
      
      if (!name || !classNum || !admissionNumber) {
        alert('Name, class, and admission number are required.');
        return;
      }
      
      if (state.candidates.some(c => c.name === name && c.admissionNumber === admissionNumber)) {
        alert('Candidate with this name and admission number already exists.');
        return;
      }
      
      const candidate = { 
        name, 
        class: classNum, 
        admissionNumber, 
        assigned: false, 
        image: null 
      };
      
      if (imageInput?.files[0]) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          candidate.image = ev.target.result;
          addCandidate(candidate);
        };
        reader.readAsDataURL(imageInput.files[0]);
      } else {
        addCandidate(candidate);
      }
    });
  }

  const teamForm = document.getElementById('team-form');
  if (teamForm) {
    teamForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('team-name');
      const leaderInput = document.getElementById('team-leader');
      const assistantInput = document.getElementById('team-assistant-leader');
      
      if (!nameInput || !leaderInput) {
        alert('Team form elements missing.');
        return;
      }
      
      const name = nameInput.value.trim();
      const leader = leaderInput.value.trim();
      const assistant = assistantInput?.value.trim() || '';
      
      if (!name || !leader) {
        alert('Team name and leader are required.');
        return;
      }
      
      if (state.teams.some(t => t.name === name)) {
        alert('Team already exists.');
        return;
      }
      
      await addTeam({ name, leader, assistant, roster: [] });
    });
  }

  showSection('candidates');
  
  if (channel) {
    channel.addEventListener('message', async (e) => {
      if (e.data === 'update') {
        await loadState();
        refreshAdminUI();
        console.log('Admin UI refreshed due to broadcast');
      }
    });
  }

  startTimerInterval();
}

async function addCandidate(candidate) {
  state.candidates.push(candidate);
  await saveState();
  updateCandidatesTable();
  document.getElementById('candidate-form')?.reset();
}

async function addTeam(team) {
  state.teams.push(team);
  await saveState();
  updateTeamsTable();
  document.getElementById('team-form')?.reset();
}

function uploadCSV() {
  const csvInput = document.getElementById('csv-file');
  if (!csvInput?.files[0]) {
    alert('Please select a CSV file.');
    return;
  }
  handleCSVUpload({ target: csvInput });
}

function handleCSVUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  console.log('Processing CSV upload:', file.name);
  Papa.parse(file, {
    skipEmptyLines: true,
    header: false,
    complete: async function(results) {
      const rows = results.data;
      const newCandidates = [];
      const errors = [];
      
      rows.forEach((row, index) => {
        if (row.length >= 3) { // Expect at least Name, Admission Number, Class
          const [name, admissionNumber, classNum, imageLink] = row;
          const trimmedName = name?.trim();
          const trimmedAdmission = admissionNumber?.trim();
          const trimmedClass = classNum?.trim();
          
          if (!trimmedName || !trimmedAdmission || !trimmedClass) {
            errors.push(`Row ${index + 1}: Missing required fields (Name, Admission Number, Class)`);
            return;
          }
          
          const classNumber = trimmedClass;  // Keep as string
          if (isNaN(parseInt(classNumber)) || parseInt(classNumber) < 1 || parseInt(classNumber) > 9) {
            errors.push(`Row ${index + 1}: Invalid class "${trimmedClass}" (must be 1–9)`);
            return;
          }
          
          if (state.candidates.some(c => c.name === trimmedName && c.admissionNumber === trimmedAdmission)) {
            errors.push(`Row ${index + 1}: Duplicate candidate "${trimmedName}" with admission number "${trimmedAdmission}"`);
            return;
          }
          
          newCandidates.push({ 
            name: trimmedName, 
            admissionNumber: trimmedAdmission, 
            class: classNumber, 
            assigned: false, 
            image: null // Images added via Edit Candidate
          });
        } else {
          errors.push(`Row ${index + 1}: Insufficient columns (expected at least 3)`);
        }
      });
      
      if (newCandidates.length > 0) {
        state.candidates.push(...newCandidates);
        await saveState();
        updateCandidatesTable();
      }
      
      const feedbackMessage = document.getElementById('csv-feedback-message');
      const feedbackModal = document.getElementById('csv-feedback-modal');
      if (feedbackMessage && feedbackModal) {
        feedbackMessage.innerHTML = `
          <p>Processed ${rows.length} rows.</p>
          <p>Added ${newCandidates.length} new candidates.</p>
          ${newCandidates.length > 0 ? `<p>Use the Edit button to add local images for candidates.</p>` : ''}
          ${errors.length > 0 ? `<p>Errors (${errors.length}):</p><ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>` : ''}
        `;
        feedbackModal.style.display = 'block';
      } else {
        alert(`Added ${newCandidates.length} new candidates. Use Edit to add images. ${errors.length > 0 ? `Errors: ${errors.join('; ')}` : ''}`);
      }
    },
    error: function(error) {
      console.error('CSV parsing error:', error);
      alert('Failed to parse CSV file. Please ensure it is correctly formatted.');
    }
  });
}

function closeCSVFeedbackModal() {
  const modal = document.getElementById('csv-feedback-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function editCandidate(name, classNum) {
  const candidate = state.candidates.find(c => c.name === name && c.class === classNum);
  if (!candidate) {
    alert('Candidate not found.');
    return;
  }

  const modal = document.getElementById('edit-candidate-modal');
  if (!modal) {
    console.error('Edit candidate modal not found in DOM');
    alert('Edit modal not found. Please check the HTML for the edit-candidate-modal element.');
    return;
  }

  console.log('Displaying edit candidate modal for:', name, classNum);
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Edit Candidate</h3>
      <form id="edit-candidate-form">
        <input type="text" id="edit-candidate-name" value="${candidate.name}" disabled>
        <input type="number" id="edit-candidate-class" value="${candidate.class}" disabled>
        <input type="text" id="edit-candidate-admission-number" value="${candidate.admissionNumber}" required>
        <input type="file" id="edit-candidate-image" accept="image/*">
        <img id="edit-candidate-image-preview" src="${candidate.image || ''}" alt="Image Preview" ${candidate.image ? '' : 'style="display: none;"'}>
        <button type="submit">Save Changes</button>
        <button type="button" onclick="cancelEditCandidate()">Cancel</button>
      </form>
    </div>
  `;
  modal.style.display = 'block';

  const imageInput = document.getElementById('edit-candidate-image');
  const imagePreview = document.getElementById('edit-candidate-image-preview');
  if (imageInput && imagePreview) {
    imageInput.addEventListener('change', () => {
      if (imageInput.files[0]) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          imagePreview.src = ev.target.result;
          imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(imageInput.files[0]);
      }
    });
  }

  const form = document.getElementById('edit-candidate-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const admissionNumber = document.getElementById('edit-candidate-admission-number').value.trim();
    const imageFile = document.getElementById('edit-candidate-image')?.files[0];

    if (!admissionNumber) {
      alert('Admission number is required.');
      return;
    }

    if (state.candidates.some(c => c.admissionNumber === admissionNumber && c.name !== name && c.class !== classNum)) {
      alert('This admission number is already used by another candidate.');
      return;
    }

    candidate.admissionNumber = admissionNumber;
    if (imageFile) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        candidate.image = ev.target.result;
        await saveState();
        updateCandidatesTable();
        modal.style.display = 'none';
        console.log('Candidate updated with local image:', candidate);
      };
      reader.readAsDataURL(imageFile);
    } else {
      await saveState();
      updateCandidatesTable();
      modal.style.display = 'none';
      console.log('Candidate updated without changing image:', candidate);
    }
  });
}

function cancelEditCandidate() {
  const modal = document.getElementById('edit-candidate-modal');
  if (modal) {
    console.log('Canceling candidate edit');
    modal.style.display = 'none';
  }
}

function updateCandidatesTable() {
  const tbody = document.querySelector('#candidates-table tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  state.candidates.forEach(candidate => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${candidate.name}</td>
      <td>${candidate.class}</td>
      <td>${candidate.admissionNumber}</td>
      <td>
        <button onclick="editCandidate('${candidate.name}', '${candidate.class}')">Edit</button>
        <button onclick="deleteCandidate('${candidate.name}', '${candidate.class}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function deleteCandidate(name, classNum) {
  if (state.auction.status === 'in_progress') {
    alert('Cannot delete candidates during auction.');
    return;
  }
  
  state.candidates = state.candidates.filter(c => 
    c.name !== name || c.class !== classNum
  );
  
  await saveState();
  updateCandidatesTable();
}

function updateTeamsTable() {
  const tbody = document.querySelector('#teams-table tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  state.teams.forEach(team => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${team.name}</td>
      <td>${team.leader}</td>
      <td>${team.assistant || ''}</td>
      <td>
        <button onclick="deleteTeam('${team.name}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function deleteTeam(name) {
  if (state.auction.status === 'in_progress') {
    alert('Cannot delete teams during auction.');
    return;
  }
  
  state.teams = state.teams.filter(t => t.name !== name);
  await saveState();
  updateTeamsTable();
}

function showSection(sectionId) {
  document.querySelectorAll('.section').forEach(section => {
    section.style.display = section.id === sectionId ? 'block' : 'none';
  });
  
  if (sectionId === 'download') {
    updateResultsPreview();
  } else if (sectionId === 'auction') {
    updateAuctionOverview();
  }
}

/* ======================
   AUCTION MANAGEMENT
   ====================== */

async function startAuction() {
  if (state.candidates.length === 0) {
    alert('Please add at least one candidate.');
    return;
  }
  
  if (state.teams.length < 2) {
    alert('Please add at least two teams.');
    return;
  }
  
  if (state.candidates.length < state.teams.length) {
    alert('Not enough candidates for the number of teams.');
    return;
  }
  
  state.auction = {
    status: 'in_progress',
    currentClass: '1',
    currentTeamIndex: 0,
    turnOrder: [],
    selections: [],
    pendingRequest: null,
    lastSelection: null,
    turnStartTime: Date.now(),
    stateVersion: state.auction.stateVersion + 1
  };
  
  state.candidates.forEach(c => c.assigned = false);
  state.teams.forEach(t => t.roster = []);
  
  await saveState();
  setTurnOrder();
  refreshAdminUI();
}

function setTurnOrder() {
  const orderStr = prompt('Enter team names in order, separated by commas (e.g., TeamA,TeamB,TeamC):');
  if (!orderStr) return;
  
  const order = orderStr.split(',').map(t => t.trim());
  const teamNames = state.teams.map(t => t.name);
  const uniqueOrder = [...new Set(order)];
  
  if (uniqueOrder.length === teamNames.length && 
      uniqueOrder.every(o => teamNames.includes(o))) {
    state.auction.turnOrder = order;
    state.auction.currentTeamIndex = 0;
    state.auction.turnStartTime = Date.now();
    state.auction.stateVersion = (state.auction.stateVersion || 0) + 1;
    saveState();
    refreshAdminUI();
  } else {
    alert('Invalid order. Must include all teams exactly once without duplicates.');
  }
}

function refreshAdminUI() {
  updateCandidatesTable();
  updateTeamsTable();
  updateAuctionControls();
  updateAuctionOverview();
}

function updateAuctionControls() {
  const statusEl = document.getElementById('auction-status');
  const startBtn = document.getElementById('start-auction');
  const stopBtn = document.getElementById('stop-auction');
  
  if (statusEl) {
    statusEl.textContent = state.auction.status.replace('_', ' ').toUpperCase();
  }
  
  if (startBtn) {
    startBtn.disabled = state.auction.status === 'in_progress';
  }
  
  if (stopBtn) {
    stopBtn.disabled = state.auction.status !== 'in_progress';
  }
}

function updateAuctionOverview() {
  const currentTurnEl = document.getElementById('current-turn-admin');
  if (currentTurnEl) {
    currentTurnEl.textContent = state.auction.turnOrder.length > 0 
      ? state.auction.turnOrder[state.auction.currentTeamIndex] 
      : 'None';
  }

  const rostersDiv = document.getElementById('admin-rosters');
  if (rostersDiv) {
    rostersDiv.innerHTML = '';
    state.teams.forEach(team => {
      const div = document.createElement('div');
      div.className = 'team-roster';
      div.innerHTML = `<h4>${team.name} (${team.roster.length} members)</h4>`;
      const ul = document.createElement('ul');
      team.roster.forEach(candidate => {
        const li = document.createElement('li');
        li.textContent = `${candidate.name} (Class ${candidate.class})`;
        ul.appendChild(li);
      });
      div.appendChild(ul);
      rostersDiv.appendChild(div);
    });
  }

  const teamCounts = document.getElementById('team-counts');
  if (teamCounts) {
    teamCounts.innerHTML = '';
    state.teams.forEach(team => {
      const div = document.createElement('div');
      div.textContent = `${team.name}: ${team.roster.length}`;
      teamCounts.appendChild(div);
    });
  }

  const unselectedCount = document.getElementById('unselected-count');
  if (unselectedCount) {
    unselectedCount.textContent = state.candidates.filter(c => !c.assigned).length;
  }

  const pendingDiv = document.getElementById('pending-requests-box');
  if (pendingDiv) {
    pendingDiv.innerHTML = '';
    if (state.auction.pendingRequest) {
      const req = state.auction.pendingRequest;
      const p = document.createElement('p');
      p.innerHTML = `
        Team ${req.team} requests ${req.candidate} (Class ${req.class}). 
        Remaining time: <span id="pending-timer">${TURN_DURATION}</span>s 
        <button onclick="acceptRequest()" class="btn-start">Accept</button> 
        <button onclick="rejectRequest()" class="btn-stop">Reject</button>
      `;
      pendingDiv.appendChild(p);
    } else {
      pendingDiv.innerHTML = '<p>No pending requests.</p>';
    }
  }

  const orderMsg = document.getElementById('turn-order-message');
  if (orderMsg) {
    orderMsg.textContent = state.auction.status === 'in_progress' && 
      state.auction.turnOrder.length === 0 
      ? 'Please set the turn order for the next round.' 
      : state.auction.turnOrder.length > 0 ? 'Set' : 'Not set';
  }

  const turnOrderList = document.getElementById('turn-order-list');
  if (turnOrderList) {
    turnOrderList.innerHTML = '';
    state.auction.turnOrder.forEach((team, index) => {
      const li = document.createElement('li');
      li.textContent = `${index + 1}. ${team}`;
      if (index === state.auction.currentTeamIndex) {
        li.style.fontWeight = 'bold';
        li.style.color = 'var(--timer-color)';
      }
      turnOrderList.appendChild(li);
    });
  }
}

/* ======================
   LEADER/AUDIENCE VIEWS
   ====================== */

async function initAuctionView() {
  await loadState();
  loadUserState();
  await updateAuctionView();
  
  const searchInput = document.getElementById('candidate-search');
  if (searchInput) {
    searchInput.addEventListener('input', updateAuctionView);
  }
  
  if (userState.role === 'leader') {
    updateRosterTable();
  } else if (userState.role === 'audience') {
    updateTeamRosters();
  }

  if (channel) {
    channel.addEventListener('message', async (e) => {
      if (e.data === 'update') {
        await loadState();
        await updateAuctionView();
        if (userState.role === 'leader') {
          updateRosterTable();
        } else if (userState.role === 'audience') {
          updateTeamRosters();
        }
        console.log(`UI updated for ${userState.role} view due to broadcast`);
      }
    });
  }

  startTimerInterval();
}

async function updateAuctionView() {
  console.log('Updating auction view for role:', userState.role, 'team:', userState.team);
  console.log('Current turn:', state.auction.turnOrder[state.auction.currentTeamIndex], 
              'Turn order:', state.auction.turnOrder, 
              'Current index:', state.auction.currentTeamIndex);
  
  const searchInput = document.getElementById('candidate-search');
  const search = searchInput?.value.toLowerCase() || '';
  
  const tbody = document.querySelector('#candidates-table tbody');
  if (tbody) {
    tbody.innerHTML = '';
    const availableCandidates = state.candidates.filter(
      c => !c.assigned && c.class === state.auction.currentClass
    );
    
    availableCandidates
      .filter(c => c.name.toLowerCase().includes(search) || 
                 c.class.includes(search))
      .forEach(candidate => {
        const tr = document.createElement('tr');
        let requestBtn = '';
        
        if (userState.role === 'leader' && 
            state.auction.status === 'in_progress' && 
            state.auction.turnOrder.length > 0 && 
            state.auction.currentTeamIndex >= 0 && 
            state.auction.currentTeamIndex < state.auction.turnOrder.length && 
            state.auction.turnOrder[state.auction.currentTeamIndex] === userState.team) {
          requestBtn = `
            <button onclick="requestCandidate('${candidate.name}', '${candidate.class}')">
              Request
            </button>
          `;
          console.log(`Showing Request button for ${candidate.name} for team ${userState.team}`);
        } else {
          console.log(`Hiding Request button for ${candidate.name}: not ${userState.team}'s turn`);
        }
        
        tr.innerHTML = `
          <td>${candidate.name}</td>
          <td>${candidate.class}</td>
          <td>${candidate.admissionNumber}</td>
          ${userState.role === 'leader' ? `<td>${requestBtn}</td>` : ''}
        `;
        tbody.appendChild(tr);
      });
  }
  
  const statusEl = document.getElementById('auction-status');
  const classEl = document.getElementById('current-class');
  const turnEl = document.getElementById('current-turn');
  
  if (statusEl) statusEl.textContent = 
    state.auction.status.replace('_', ' ').toUpperCase();
  
  if (classEl) classEl.textContent = 
    state.auction.currentClass || 'None';
  
  if (turnEl) turnEl.textContent = 
    (state.auction.turnOrder.length > 0 && 
     state.auction.currentTeamIndex >= 0 && 
     state.auction.currentTeamIndex < state.auction.turnOrder.length 
      ? state.auction.turnOrder[state.auction.currentTeamIndex] 
      : 'None') || 'None';

  if (userState.role === 'audience') {
    updateTeamRosters();
  }

  if (userState.role === 'leader') {
    const teamEl = document.getElementById('leader-team');
    if (teamEl) teamEl.textContent = userState.team;
    updateRosterTable();
  }

  const popup = document.getElementById('selection-popup');
  const popupMessage = document.getElementById('popup-message');
  if (popup && state.auction.lastSelection) {
    const candidate = state.candidates.find(
      c => c.name === state.auction.lastSelection.candidate && 
           c.class === state.auction.lastSelection.class
    );
    if (candidate && popupMessage) {
      popupMessage.innerHTML = `<span class="highlight">${candidate.name}</span> (Class ${candidate.class}) selected by <span class="highlight">${state.auction.lastSelection.team}</span>`;
      popup.style.display = 'block';
      setTimeout(() => {
        popup.style.display = 'none';
      }, 3000);
    }
  }
}

function updateRosterTable() {
  const tbody = document.querySelector('#roster-table tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  const team = state.teams.find(t => t.name === userState.team);
  
  if (team) {
    team.roster.forEach(candidate => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${candidate.name}</td>
        <td>${candidate.class}</td>
        <td>${candidate.admissionNumber}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

function updateTeamRosters() {
  const rostersDiv = document.getElementById('team-rosters');
  if (!rostersDiv) return;
  
  rostersDiv.innerHTML = '';
  state.teams.forEach(team => {
    const div = document.createElement('div');
    div.className = 'team-roster';
    div.innerHTML = `<h4>${team.name} (${team.roster.length} members)</h4>`;
    const ul = document.createElement('ul');
    
    team.roster.forEach(candidate => {
      const li = document.createElement('li');
      li.textContent = `${candidate.name} (Class ${candidate.class})`;
      ul.appendChild(li);
    });
    
    div.appendChild(ul);
    rostersDiv.appendChild(div);
  });
}

/* ======================
   AUCTION OPERATIONS
   ====================== */

async function requestCandidate(name, classNum) {
  console.log(`Requesting candidate ${name} (Class ${classNum}) for team ${userState.team}`);
  if (state.auction.status !== 'in_progress') {
    console.log('Request failed: Auction not in progress');
    alert('Auction is not in progress.');
    return;
  }
  
  const currentTeam = state.auction.turnOrder[state.auction.currentTeamIndex];
  if (currentTeam !== userState.team) {
    console.log('Request failed: Not your turn');
    alert('Not your turn.');
    return;
  }
  
  if (state.auction.pendingRequest) {
    console.log('Request failed: Pending request exists');
    alert('There is already a pending request.');
    return;
  }
  
  const candidate = state.candidates.find(c => 
    c.name === name && c.class === classNum && !c.assigned
  );
  
  if (!candidate) {
    console.log('Request failed: Candidate not available');
    alert('Candidate not available.');
    return;
  }
  
  state.auction.pendingRequest = { 
    team: currentTeam, 
    candidate: name, 
    class: classNum 
  };
  
  await saveState();
  console.log('Candidate request saved:', state.auction.pendingRequest);
}

async function acceptRequest() {
  const req = state.auction.pendingRequest;
  if (!req) return;
  
  console.log('Accepting request:', req);
  const candidate = state.candidates.find(c => 
    c.name === req.candidate && 
    c.class === req.class &&
    !c.assigned
  );
  
  if (!candidate) {
    console.log('Accept failed: Candidate not available');
    state.auction.pendingRequest = null;
    await saveState();
    return;
  }
  
  candidate.assigned = true;
  const team = state.teams.find(t => t.name === req.team);
  
  if (team) {
    team.roster.unshift(candidate);
  }
  
  state.auction.selections.push({ 
    candidate: req.candidate, 
    class: req.class, 
    team: req.team 
  });
  
  state.auction.lastSelection = { 
    ...req,
    time: Date.now() 
  };
  
  state.auction.pendingRequest = null;
  state.auction.stateVersion = (state.auction.stateVersion || 0) + 1;
  await nextTurn();
  await saveState();
  console.log('Request accepted, state updated');
}

async function rejectRequest() {
  console.log('Rejecting request:', state.auction.pendingRequest);
  state.auction.pendingRequest = null;
  state.auction.stateVersion = (state.auction.stateVersion || 0) + 1;
  await saveState();
}

async function stopAuction() {
  console.log('Stopping auction');
  state.auction.status = 'not_started';
  state.auction.turnOrder = [];
  state.auction.currentTeamIndex = 0;
  state.auction.pendingRequest = null;
  state.auction.turnStartTime = null;
  state.auction.stateVersion = (state.auction.stateVersion || 0) + 1;
  await saveState();
  refreshAdminUI();
}

async function nextTurn() {
  console.log('Advancing to next turn. Current state:', state.auction);
  const remaining = state.candidates.filter(c => 
    !c.assigned && c.class === state.auction.currentClass
  ).length;
  
  if (remaining === 0) {
    let nextClass = (parseInt(state.auction.currentClass) + 1).toString();
    let hasCandidates = false;
    
    while (parseInt(nextClass) <= 9) {
      if (state.candidates.some(c => !c.assigned && c.class === nextClass)) {
        state.auction.currentClass = nextClass;
        state.auction.turnOrder = [];
        state.auction.currentTeamIndex = 0;
        state.auction.turnStartTime = null;
        state.auction.stateVersion = (state.auction.stateVersion || 0) + 1;
        await saveState();
        if (userState.role === 'admin') {
          setTimeout(setTurnOrder, 100);
        }
        console.log(`Moved to Class ${nextClass}, prompting for new turn order`);
        hasCandidates = true;
        break;
      }
      nextClass = (parseInt(nextClass) + 1).toString();
    }
    
    if (!hasCandidates) {
      state.auction.status = 'completed';
      state.auction.turnOrder = [];
      state.auction.currentTeamIndex = 0;
      state.auction.turnStartTime = null;
      state.auction.stateVersion = (state.auction.stateVersion || 0) + 1;
      await saveState();
      console.log('Auction completed: no more candidates');
    }
  } else {
    state.auction.currentTeamIndex = (state.auction.currentTeamIndex + 1) % state.auction.turnOrder.length;
    state.auction.turnStartTime = Date.now();
    state.auction.stateVersion = (state.auction.stateVersion || 0) + 1;
    await saveState();
    console.log(`Next turn: Team ${state.auction.turnOrder[state.auction.currentTeamIndex]}`);
  }
  
  if (userState.role === 'admin') {
    refreshAdminUI();
  } else {
    await updateAuctionView();
  }
}

/* ======================
   TIMER
   ====================== */

function startTimerInterval() {
  clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 1000);
  updateTimer();
}

function updateTimer() {
  const timerEls = document.querySelectorAll('.timer');
  const pendingTimer = document.getElementById('pending-timer');
  const progressBar = document.getElementById('timer-progress-bar');
  
  if (state.auction.status !== 'in_progress' || 
      state.auction.turnOrder.length === 0 || 
      !state.auction.turnStartTime) {
    timerEls.forEach(el => el.textContent = TURN_DURATION);
    if (pendingTimer) pendingTimer.textContent = TURN_DURATION;
    if (progressBar) progressBar.style.width = '100%';
    return;
  }
  
  const elapsed = (Date.now() - state.auction.turnStartTime) / 1000;
  let timeLeft = Math.max(0, TURN_DURATION - Math.floor(elapsed));
  
  timerEls.forEach(el => el.textContent = timeLeft);
  if (pendingTimer) pendingTimer.textContent = timeLeft;
  if (progressBar) {
    const progress = (timeLeft / TURN_DURATION) * 100;
    progressBar.style.width = `${progress}%`;
  }
  
  if (timeLeft <= 0) {
    console.log('Timer expired');
    if (state.auction.pendingRequest) {
      acceptRequest();
    } else {
      nextTurn();
      saveState();
    }
  }
}

/* ======================
   RESULTS MANAGEMENT
   ====================== */

function updateResultsPreview() {
  const tbody = document.querySelector('#results-preview tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  state.auction.selections.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.candidate}</td>
      <td>${s.class}</td>
      <td>${s.team}</td>
    `;
    tbody.appendChild(tr);
  });
  
  state.candidates.filter(c => !c.assigned).forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.name}</td>
      <td>${c.class}</td>
      <td>Unassigned</td>
    `;
    tbody.appendChild(tr);
  });
}

function downloadResults() {
  if (state.auction.selections.length === 0 && 
      state.candidates.every(c => c.assigned)) {
    alert('No results available to download.');
    return;
  }
  
  let csv = 'Candidate,Class,Team\n';
  
  state.auction.selections.forEach(s => {
    const escapedCandidate = s.candidate.includes(',') 
      ? `"${s.candidate}"` 
      : s.candidate;
    csv += `${escapedCandidate},${s.class},${s.team}\n`;
  });
  
  state.candidates.filter(c => !c.assigned).forEach(c => {
    const escapedCandidate = c.name.includes(',') 
      ? `"${c.name}"` 
      : c.name;
    csv += `${escapedCandidate},${c.class},Unassigned\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'auction_results.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ======================
   SYSTEM RESET
   ====================== */

async function resetSystem() {
  const modal = document.getElementById('reset-modal');
  if (!modal) {
    console.error('Reset modal not found in DOM');
    alert('Reset modal not found. Please check the HTML for the reset-modal element.');
    return;
  }
  
  console.log('Displaying reset modal');
  modal.style.display = 'block';
}

async function confirmReset() {
  console.log('Initiating system reset');
  try {
    localStorage.removeItem('appState');
    state = {...defaultState};
    lastStateVersion = 0;
    await saveState(false);
    
    updateCandidatesTable();
    updateTeamsTable();
    updateAuctionControls();
    updateAuctionOverview();
    updateResultsPreview();
    
    clearInterval(timerInterval);
    
    if (document.getElementById('team-rosters')) {
      updateTeamRosters();
    }
    
    const modal = document.getElementById('reset-modal');
    modal.style.display = 'none';
    alert('System reset successfully!');
    
    if (channel) {
      channel.postMessage('update');
    }
    
    if (userState.role === 'admin') {
      refreshAdminUI();
    } else {
      await updateAuctionView();
    }
    
    console.log('System reset completed');
  } catch (e) {
    console.error('Error resetting system:', e);
    alert('Failed to reset system. Please try again.');
  }
}

function cancelReset() {
  const modal = document.getElementById('reset-modal');
  if (modal) {
    console.log('Canceling reset');
    modal.style.display = 'none';
  }
}

/* ======================
   INITIALIZATION
   ====================== */

async function initializePage() {
  await loadState();
  loadUserState();
  const path = window.location.pathname.toLowerCase();
  
  if (path.includes('index.html') || path.endsWith('/')) {
    // Role selection page
  } else if (path.includes('admin.html')) {
    if (userState.role !== 'admin') {
      window.location.href = 'index.html';
    } else {
      await initAdmin();
    }
  } else if (path.includes('leader.html')) {
    if (userState.role !== 'leader' || !userState.team) {
      window.location.href = 'index.html';
    } else {
      await initAuctionView();
    }
  } else if (path.includes('audience.html')) {
    if (userState.role !== 'audience') {
      window.location.href = 'index.html';
    } else {
      await initAuctionView();
    }
  }
}
/* ======================
   EXPORT TO WINDOW
   ====================== */
// ======================
// MAKE FUNCTIONS GLOBAL
// ======================
window.selectRole = selectRole;
window.confirmAdminPassword = confirmAdminPassword;
window.confirmLeaderTeam = confirmLeaderTeam;
window.logout = logout;

window.uploadCSV = uploadCSV;
window.closeCSVFeedbackModal = closeCSVFeedbackModal;
window.editCandidate = editCandidate;
window.cancelEditCandidate = cancelEditCandidate;
window.deleteCandidate = deleteCandidate;
window.deleteTeam = deleteTeam;

window.showSection = showSection;
window.startAuction = startAuction;
window.setTurnOrder = setTurnOrder;
window.acceptRequest = acceptRequest;
window.rejectRequest = rejectRequest;

window.requestCandidate = requestCandidate;



document.addEventListener('DOMContentLoaded', initializePage);


const res = await fetch('https://your-backend.onrender.com/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, code })
});
