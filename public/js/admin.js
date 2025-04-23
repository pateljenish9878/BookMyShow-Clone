// Admin Panel JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Path tracking for sidebar active state
    const currentPath = window.location.pathname;
    const sidebarLinks = document.querySelectorAll('.sidebar .nav-link');
    
    sidebarLinks.forEach(link => {
        const linkPath = link.getAttribute('href');
        if (currentPath === linkPath || currentPath.startsWith(linkPath + '/')) {
            link.classList.add('active');
        }
    });

    // Image preview for file uploads
    const imageInputs = document.querySelectorAll('input[type="file"][accept*="image"]');
    
    imageInputs.forEach(input => {
        const previewId = input.getAttribute('data-preview');
        if (previewId) {
            const preview = document.getElementById(previewId);
            
            input.addEventListener('change', function() {
                if (input.files && input.files[0]) {
                    const reader = new FileReader();
                    
                    reader.onload = function(e) {
                        preview.src = e.target.result;
                        preview.style.display = 'block';
                    };
                    
                    reader.readAsDataURL(input.files[0]);
                }
            });
        }
    });

    // Theater screen management
    const theaterSelect = document.getElementById('theaterId');
    const screenSelect = document.getElementById('screenId');
    
    if (theaterSelect && screenSelect) {
        theaterSelect.addEventListener('change', function() {
            const theaterId = this.value;
            
            if (theaterId) {
                // Fetch screens for the selected theater
                fetch(`/admin/theaters/${theaterId}/screens`)
                    .then(response => response.json())
                    .then(data => {
                        // Clear existing options
                        screenSelect.innerHTML = '<option value="">Select Screen</option>';
                        
                        // Add new options
                        if (data.screens && data.screens.length > 0) {
                            data.screens.forEach(screen => {
                                const option = document.createElement('option');
                                option.value = screen._id;
                                option.textContent = `${screen.name} (${screen.totalSeats} seats)`;
                                screenSelect.appendChild(option);
                            });
                            
                            screenSelect.disabled = false;
                        } else {
                            screenSelect.disabled = true;
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching screens:', error);
                        screenSelect.innerHTML = '<option value="">Error loading screens</option>';
                        screenSelect.disabled = true;
                    });
            } else {
                screenSelect.innerHTML = '<option value="">Select Theater First</option>';
                screenSelect.disabled = true;
            }
        });
    }

    // Dynamic screen fields for theater form
    const addScreenBtn = document.getElementById('addScreenBtn');
    const screenContainer = document.getElementById('screenContainer');
    
    if (addScreenBtn && screenContainer) {
        let screenCount = document.querySelectorAll('.screen-row').length || 0;
        
        addScreenBtn.addEventListener('click', function() {
            screenCount++;
            
            const screenRow = document.createElement('div');
            screenRow.className = 'screen-row border p-3 mb-3 rounded position-relative';
            screenRow.dataset.index = screenCount;
            
            screenRow.innerHTML = `
                <button type="button" class="btn btn-sm btn-danger position-absolute top-0 end-0 m-2 remove-screen">
                    <i class="fas fa-times"></i>
                </button>
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label for="screenName${screenCount}" class="form-label">Screen Name</label>
                        <input type="text" class="form-control" id="screenName${screenCount}" name="screenName" required>
                    </div>
                    <div class="col-md-6 mb-3">
                        <label for="screenSeats${screenCount}" class="form-label">Total Seats</label>
                        <input type="number" class="form-control" id="screenSeats${screenCount}" name="screenSeats" min="1" required>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label for="screenRows${screenCount}" class="form-label">Number of Rows</label>
                        <input type="number" class="form-control" id="screenRows${screenCount}" name="screenRows" min="1" required>
                    </div>
                    <div class="col-md-6 mb-3">
                        <label for="screenColumns${screenCount}" class="form-label">Number of Columns</label>
                        <input type="number" class="form-control" id="screenColumns${screenCount}" name="screenColumns" min="1" required>
                    </div>
                </div>
            `;
            
            screenContainer.appendChild(screenRow);
            
            // Add event listener to remove button
            const removeBtn = screenRow.querySelector('.remove-screen');
            removeBtn.addEventListener('click', function() {
                screenRow.remove();
            });
        });
        
        // Add event listeners to existing remove buttons
        document.querySelectorAll('.remove-screen').forEach(btn => {
            btn.addEventListener('click', function() {
                this.closest('.screen-row').remove();
            });
        });
    }

    // Initialize any datepickers
    const datePickers = document.querySelectorAll('.datepicker');
    if (datePickers.length > 0 && typeof flatpickr !== 'undefined') {
        datePickers.forEach(picker => {
            flatpickr(picker, {
                dateFormat: "Y-m-d",
                minDate: "today"
            });
        });
    }

    // Initialize any timepickers
    const timePickers = document.querySelectorAll('.timepicker');
    if (timePickers.length > 0 && typeof flatpickr !== 'undefined') {
        timePickers.forEach(picker => {
            flatpickr(picker, {
                enableTime: true,
                noCalendar: true,
                dateFormat: "H:i",
                time_24hr: true
            });
        });
    }
}); 