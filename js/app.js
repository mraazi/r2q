// Storage keys for localStorage
const STORAGE_KEY = 'quran_students';


// State
let students = [];
let deleteTargetId = null;

// DOM Elements
const addStudentForm = document.getElementById('addStudentForm');
const studentTableBody = document.getElementById('studentTableBody');
const studentTable = document.getElementById('studentTable');
const emptyState = document.getElementById('emptyState');
const studentCount = document.getElementById('studentCount');
const surahSelect = document.getElementById('surahSelect');
const editSurahSelect = document.getElementById('editSurahSelect');
const editModal = document.getElementById('editModal');
const deleteModal = document.getElementById('deleteModal');
const editStudentForm = document.getElementById('editStudentForm');

// Initialize app
function init() {
  loadStudents();
  populateSurahDropdowns();
  renderStudents();
  setupEventListeners();
}

// Default students (pre-loaded)
const DEFAULT_STUDENTS = [
  { id: 'student_ariz', name: 'Ariz', surah: 1, page: 1 },
  { id: 'student_raza', name: 'Raza', surah: 1, page: 1 },
  { id: 'student_rayyan', name: 'Rayyan', surah: 1, page: 1 }
];

// Load students from localStorage
function loadStudents() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    students = JSON.parse(stored);
  } else {
    // First time: load default students
    students = DEFAULT_STUDENTS;
    saveStudents();
  }
}

// Save students to localStorage
function saveStudents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
}

// Populate surah dropdowns
function populateSurahDropdowns() {
  const options = SURAHS.map(s =>
    `<option value="${s.number}">${s.number}. ${s.latin} - ${s.name}</option>`
  ).join('');

  surahSelect.innerHTML = options;
  editSurahSelect.innerHTML = options;
}

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Render students table
function renderStudents() {
  // Update count
  studentCount.textContent = students.length;

  // Show/hide table and empty state
  if (students.length === 0) {
    studentTable.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  studentTable.classList.remove('hidden');
  emptyState.classList.add('hidden');

  // Render rows
  studentTableBody.innerHTML = students.map(student => {
    const surah = getSurah(student.surah);
    return `
      <tr data-id="${student.id}">
        <td><strong>${escapeHtml(student.name)}</strong></td>
        <td>
          <span class="surah-name">${surah.latin}</span>
          <span class="surah-arabic">${surah.name}</span>
        </td>
        <td>
          <div class="page-display">
            <span class="page-number">${student.page}</span>
          </div>
        </td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-quran btn-sm" onclick="openQuran(${student.page})">
              Open Quran
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openEditModal('${student.id}')">
              Edit
            </button>
            <button class="btn btn-danger btn-sm" onclick="openDeleteModal('${student.id}')">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add new student
function addStudent(name, surah, page) {
  const student = {
    id: generateId(),
    name: name.trim(),
    surah: parseInt(surah),
    page: parseInt(page)
  };

  students.push(student);
  saveStudents();
  renderStudents();
}

// Update student
function updateStudent(id, name, surah, page) {
  const index = students.findIndex(s => s.id === id);
  if (index !== -1) {
    students[index].name = name.trim();
    students[index].surah = parseInt(surah);
    students[index].page = parseInt(page);
    saveStudents();
    renderStudents();
  }
}

// Delete student
function deleteStudent(id) {
  students = students.filter(s => s.id !== id);
  saveStudents();
  renderStudents();
}

// Open Quran at specific page
function openQuran(page) {
  const url = getQuranUrl(page);
  window.open(url, '_blank');
}

// Modal functions
function openEditModal(id) {
  const student = students.find(s => s.id === id);
  if (!student) return;

  document.getElementById('editStudentId').value = student.id;
  document.getElementById('editStudentName').value = student.name;
  document.getElementById('editSurahSelect').value = student.surah;
  document.getElementById('editPageNumber').value = student.page;

  editModal.classList.add('active');
}

function closeEditModal() {
  editModal.classList.remove('active');
}

function openDeleteModal(id) {
  const student = students.find(s => s.id === id);
  if (!student) return;

  deleteTargetId = id;
  document.getElementById('deleteStudentName').textContent = student.name;
  deleteModal.classList.add('active');
}

function closeDeleteModal() {
  deleteModal.classList.remove('active');
  deleteTargetId = null;
}

function confirmDelete() {
  if (deleteTargetId) {
    deleteStudent(deleteTargetId);
    closeDeleteModal();
  }
}

// Event listeners
function setupEventListeners() {
  // Add student form
  addStudentForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('studentName').value;
    const surah = document.getElementById('surahSelect').value;
    const page = document.getElementById('pageNumber').value;

    addStudent(name, surah, page);

    // Reset form
    addStudentForm.reset();
    document.getElementById('pageNumber').value = 1;
  });

  // Edit student form
  editStudentForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const id = document.getElementById('editStudentId').value;
    const name = document.getElementById('editStudentName').value;
    const surah = document.getElementById('editSurahSelect').value;
    const page = document.getElementById('editPageNumber').value;

    updateStudent(id, name, surah, page);
    closeEditModal();
  });

  // Close modals when clicking outside
  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) closeEditModal();
  });

  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) closeDeleteModal();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEditModal();
      closeDeleteModal();
    }
  });

  // Auto-update surah when page changes (for add form)
  document.getElementById('pageNumber').addEventListener('change', (e) => {
    const page = parseInt(e.target.value);
    if (page >= 1 && page <= 604) {
      const surah = getPageSurah(page);
      document.getElementById('surahSelect').value = surah;
    }
  });

  // Auto-update surah when page changes (for edit form)
  document.getElementById('editPageNumber').addEventListener('change', (e) => {
    const page = parseInt(e.target.value);
    if (page >= 1 && page <= 604) {
      const surah = getPageSurah(page);
      document.getElementById('editSurahSelect').value = surah;
    }
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  init();
});
