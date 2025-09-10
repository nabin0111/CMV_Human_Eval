let currentPageNum = 0; // Start at user info page (0)
let totalPages = 0;     // = surveyData.length + 1 (user info)
let surveyData = [];
let responses = {};
let userInfo = {};
let lastBackupPageNum = -1;         // 마지막 자동 백업이 실행된 페이지(10의 배수에서 1회만)
let deferredShowPageNum = null;     // CSV 로딩 후 복원 시 사용할 페이지 번호

// Flash page change indicator
function flashPageChangeIndicator() {
    let indicator = document.getElementById('pageChangeIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'pageChangeIndicator';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #3498db;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: bold;
            opacity: 0;
            transform: translateY(-10px);
            transition: all 0.3s ease;
            z-index: 10000;
            pointer-events: none;
        `;
        document.body.appendChild(indicator);
    }

    indicator.textContent = `Page ${currentPageNum + 1} of ${totalPages}`;
    indicator.style.opacity = '1';
    indicator.style.transform = 'translateY(0)';

    setTimeout(() => {
        indicator.style.opacity = '0';
        indicator.style.transform = 'translateY(-10px)';
    }, 2000);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', function () {
    updateNavigation();
    updateProgressBar();
    loadCSVData();

    // 🔄 이전 진행상황 복원(메모리로만 우선 복원)
    const savedResponses = localStorage.getItem('survey_responses');
    const savedUserInfo = localStorage.getItem('survey_userInfo');
    const savedPage = localStorage.getItem('survey_currentPage');

    if (savedResponses) {
        responses = JSON.parse(savedResponses);
        console.log('🔄 Restored responses from localStorage');
    }
    if (savedUserInfo) {
        userInfo = JSON.parse(savedUserInfo);
        console.log('🔄 Restored user info from localStorage');
        // 사용자 정보 폼 채우기(폼이 이미 DOM에 있을 가능성 높음)
        fillUserInfoFormFromSaved();
    }
    if (savedPage) {
        deferredShowPageNum = parseInt(savedPage, 10);
        console.log(`🔄 Will resume from page ${deferredShowPageNum} after pages are created`);
    }

    addPageTransitionStyles();
    createLoadingIndicator();
});

// Load CSV data
async function loadCSVData() {
    try {
        // Try to load from the data folder
        const response = await fetch('./data/survey_data.csv');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const csvText = await response.text();

        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: false,
            complete: function (results) {
                console.log('CSV loaded successfully:', results.data.length, 'rows');
                surveyData = results.data;
                processData();
            },
            error: function (error) {
                console.error('CSV parsing error:', error);
                showError('Error parsing CSV data: ' + error.message);
            }
        });
    } catch (error) {
        console.error('Failed to load CSV:', error);
        showError('Failed to load survey data. Please make sure the CSV file exists in the data folder.');
    }
}

// Process the loaded data and create survey pages
function processData() {
    if (!surveyData || surveyData.length === 0) {
        showError('No data found in CSV file');
        return;
    }

    // Assuming CSV structure:
    // opinion, set_a_arg1, set_a_arg2, set_a_arg3, set_b_arg1, set_b_arg2, set_b_arg3
    totalPages = surveyData.length + 1; // +1 for user info page
    document.getElementById('totalPages').textContent = totalPages;

    createSurveyPages();
    console.log(`Created ${surveyData.length} survey pages`);

    // 페이지가 모두 만들어진 뒤 복원 페이지로 이동 + 입력값 하이드레이션
    if (deferredShowPageNum !== null) {
        // 범위를 벗어나면 안전하게 보정
        const safePage = Math.min(Math.max(0, deferredShowPageNum), totalPages);
        showPage(safePage);
        fillInputsFromResponsesForPage(safePage);
    }
}

// Create survey pages dynamically
function createSurveyPages() {
    const container = document.querySelector('.container');
    const navigation = document.querySelector('.navigation');

    surveyData.forEach((row, index) => {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page hidden';
        pageDiv.id = `page${index + 1}`;

        pageDiv.innerHTML = `
            <div class="content">
                <div class="opinion-section">
                    <div class="opinion-title">Original Opinion:</div>
                    <div class="opinion-text">${row.opinion || 'Opinion text not available'}</div>
                </div>

                <div class="sets-container">
                    <div class="set-box">
                        <div class="set-title">Set A</div>
                        ${createArgumentItems(row, 'set_a', 3)}
                    </div>

                    <div class="set-box">
                        <div class="set-title">Set B</div>
                        ${createArgumentItems(row, 'set_b', 3)}
                    </div>
                </div>

                <div class="questions-container">
                    <div class="question-box">
                        <div class="question-title">Which counterargument is most persuasive?</div>
                        <div class="question-content">
                            <div class="radio-group">
                                ${createRadioOptions(index + 1, 'persuasive', ['Set A-1', 'Set A-2', 'Set A-3', 'Set B-1', 'Set B-2', 'Set B-3', 'Hard to decide'])}
                            </div>
                            <div style="margin-top: 20px;">
                                <label for="q${index + 1}_persuasive_comments">Comments (optional):</label>
                                <textarea class="textarea" id="q${index + 1}_persuasive_comments" name="q${index + 1}_persuasive_comments"
                                    placeholder="Please explain your reasoning..."></textarea>
                            </div>
                        </div>
                    </div>

                    <div class="question-box">
                        <div class="question-title">Which set has more diverse counterarguments?</div>
                        <div class="question-content">
                            <div class="radio-group">
                                ${createRadioOptions(index + 1, 'diversity', ['Set A', 'Set B', 'Hard to decide'])}
                            </div>
                            <div style="margin-top: 20px;">
                                <label for="q${index + 1}_diversity_comments">Comments (optional):</label>
                                <textarea class="textarea" id="q${index + 1}_diversity_comments" name="q${index + 1}_diversity_comments"
                                    placeholder="Please explain your reasoning..."></textarea>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.insertBefore(pageDiv, navigation);
    });
}

// Create argument items for a set
function createArgumentItems(row, setPrefix, count) {
    let html = '';
    for (let i = 1; i <= count; i++) {
        const argKey = `${setPrefix}_arg${i}`;
        const argText = row[argKey] || `Argument ${i} not available`;

        html += `
            <div class="argument-item">
                <div class="argument-number">${i}.</div>
                <div class="argument-text">${argText}</div>
            </div>
        `;
    }
    return html;
}

// Create radio options
function createRadioOptions(pageNum, questionType, options) {
    return options.map(option => `
        <label class="radio-option">
            <input type="radio" name="q${pageNum}_${questionType}" value="${option}"> ${option}
        </label>
    `).join('');
}

// Show error message
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.innerHTML = `<strong>Error:</strong> ${message}`;

    const content = document.querySelector('#loadingPage .content .loading');
    content.innerHTML = '<h3>Error Loading Data</h3>';
    content.appendChild(errorDiv);
}

// Update progress bar
function updateProgressBar() {
    const progress = totalPages > 0 ? (currentPageNum / totalPages) * 100 : 0;
    document.getElementById('progressFill').style.width = progress + '%';
}

// Update navigation
function updateNavigation() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const currentPageSpan = document.getElementById('currentPage');

    prevBtn.disabled = currentPageNum === 0;
    currentPageSpan.textContent = currentPageNum + 1;

    if (currentPageNum === 0) {
        nextBtn.textContent = 'Start Survey';
        prevBtn.style.visibility = 'hidden';
    } else {
        prevBtn.style.visibility = 'visible';
        if (currentPageNum === totalPages) {
            nextBtn.textContent = 'Complete';
        } else {
            nextBtn.textContent = 'Next';
        }
    }
}

// Scroll to top function
function scrollToTop() {
    window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'smooth'
    });

    if (window.scrollY > 0) {
        setTimeout(() => {
            if (window.scrollY > 50) {
                window.scrollTo(0, 0);
            }
        }, 100);
    }
}

// Add CSS for page transitions (inject into document)
function addPageTransitionStyles() {
    if (document.getElementById('pageTransitionStyles')) return;

    const style = document.createElement('style');
    style.id = 'pageTransitionStyles';
    style.textContent = `
        .page {
            opacity: 1;
            transform: translateX(0);
            transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
        }
        
        .page.hidden {
            opacity: 0;
            transform: translateX(-20px);
            pointer-events: none;
        }
        
        .page.fade-out {
            opacity: 0;
            transform: translateX(20px);
        }
        
        .page.fade-in {
            opacity: 1;
            transform: translateX(0);
        }
        
        .page-transition-loading {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 255, 255, 0.9);
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 9999;
            display: none;
            align-items: center;
            gap: 10px;
        }
        
        .page-transition-loading.active {
            display: flex;
        }
        
        .spinner {
            width: 20px;
            height: 20px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        #progressFill {
            transition: width 0.4s ease-out;
        }
        
        .nav-btn:active {
            transform: translateY(1px);
            transition: transform 0.1s;
        }
        
        .content {
            animation: contentFadeIn 0.5s ease-in-out;
        }
        
        @keyframes contentFadeIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    document.head.appendChild(style);
}

// Create loading indicator
function createLoadingIndicator() {
    if (document.getElementById('pageTransitionLoading')) return;

    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'pageTransitionLoading';
    loadingDiv.className = 'page-transition-loading';
    loadingDiv.innerHTML = `
        <div class="spinner"></div>
        <span>Loading next page...</span>
    `;
    document.body.appendChild(loadingDiv);
}

// Show loading indicator
function showLoadingIndicator() {
    const loading = document.getElementById('pageTransitionLoading');
    if (loading) {
        loading.classList.add('active');
    }
}

// Hide loading indicator
function hideLoadingIndicator() {
    const loading = document.getElementById('pageTransitionLoading');
    if (loading) {
        loading.classList.remove('active');
    }
}

// Show specific page with transition effect
function showPage(pageNum, direction = 'next') {
    addPageTransitionStyles();
    createLoadingIndicator();

    showLoadingIndicator();

    const currentVisiblePage = document.querySelector('.page:not(.hidden)');

    if (currentVisiblePage) {
        currentVisiblePage.classList.add('fade-out');
    }

    setTimeout(() => {
        const pages = document.querySelectorAll('.page');
        pages.forEach(page => {
            page.classList.add('hidden');
            page.classList.remove('fade-out', 'fade-in');
        });

        let targetPage;
        if (pageNum === 0) {
            targetPage = document.getElementById('userInfoPage');
        } else if (pageNum <= totalPages - 1) {
            targetPage = document.getElementById(`page${pageNum}`);
        } else {
            targetPage = document.getElementById('thankYouPage');
        }

        if (targetPage) {
            targetPage.classList.remove('hidden');
            targetPage.classList.add('fade-in');
            scrollToTop();
        }

        currentPageNum = pageNum;
        updateProgressBar();
        updateNavigation();

        hideLoadingIndicator();

        // 페이지를 보여준 직후 저장된 응답으로 입력값 복원
        fillInputsFromResponsesForPage(currentPageNum);

        flashPageChangeIndicator();

    }, 200);
}

// ✅ 현재 페이지의 입력값을 responses/userInfo로부터 복원
function fillInputsFromResponsesForPage(pageNum) {
    if (pageNum === 0) {
        fillUserInfoFormFromSaved();
        return;
    }
    if (pageNum < 1 || pageNum > totalPages - 1) return;

    const page = document.getElementById(`page${pageNum}`);
    if (!page) return;

    // 라디오 복원
    const radios = page.querySelectorAll('input[type="radio"]');
    const names = new Set(Array.from(radios).map(r => r.name));
    names.forEach(name => {
        const saved = responses[name];
        if (saved !== undefined) {
            const toCheck = page.querySelector(`input[type="radio"][name="${name}"][value="${CSS.escape(saved)}"]`);
            if (toCheck) {
                toCheck.checked = true;
            }
        }
    });

    // 텍스트에어리어 복원
    const textareas = page.querySelectorAll('textarea');
    textareas.forEach(ta => {
        const saved = responses[ta.name];
        if (saved !== undefined) {
            ta.value = saved;
        }
    });
}

// 사용자 정보 폼을 userInfo로 복원
function fillUserInfoFormFromSaved() {
    const form = document.getElementById('userInfoForm');
    if (!form || !userInfo) return;
    const nameInput = form.querySelector('[name="userName"]');
    const emailInput = form.querySelector('[name="userEmail"]');
    const affInput = form.querySelector('[name="userAffiliation"]');

    if (nameInput && userInfo.name) nameInput.value = userInfo.name;
    if (emailInput && userInfo.email) emailInput.value = userInfo.email;
    if (affInput && userInfo.affiliation) affInput.value = userInfo.affiliation;
}

// Validate user info
function validateUserInfo() {
    const form = document.getElementById('userInfoForm');
    const formData = new FormData(form);

    const name = (formData.get('userName') || '').trim();
    const email = (formData.get('userEmail') || '').trim();

    if (!name || !email) {
        alert('Please fill in all required fields (Name and Email).');
        return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('Please enter a valid email address.');
        return false;
    }

    userInfo = {
        name: name,
        email: email,
        affiliation: (formData.get('userAffiliation') || '').trim() || 'Not provided'
    };

    // 사용자 정보 즉시 저장
    localStorage.setItem('survey_userInfo', JSON.stringify(userInfo));

    return true;
}

// Validate current page responses
function validateCurrentPage() {
    if (currentPageNum === 0) {
        return validateUserInfo();
    }

    if (currentPageNum > totalPages - 1 || currentPageNum < 1) {
        return true; // thank you 등
    }

    const currentPage = document.getElementById(`page${currentPageNum}`);
    if (!currentPage) return true;

    const requiredQuestions = [
        `q${currentPageNum}_persuasive`,
        `q${currentPageNum}_diversity`
    ];

    const missingAnswers = [];

    for (const questionName of requiredQuestions) {
        const radioGroup = currentPage.querySelectorAll(`input[name="${questionName}"]`);
        const isAnswered = Array.from(radioGroup).some(radio => radio.checked);
        if (!isAnswered) {
            const questionBox = currentPage.querySelector(`input[name="${questionName}"]`).closest('.question-box');
            const questionTitle = questionBox.querySelector('.question-title').textContent;
            missingAnswers.push(questionTitle);
        }
    }

    if (missingAnswers.length > 0) {
        showValidationError(missingAnswers);
        return false;
    }

    return true;
}

// Show validation error with visual feedback
function showValidationError(missingAnswers) {
    let modal = document.getElementById('validationErrorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'validationErrorModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10002;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 10px;
            max-width: 500px;
            margin: 20px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            transform: translateY(-20px);
            transition: transform 0.3s ease;
        `;

        modalContent.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
            <h3 style="color: #e74c3c; margin-bottom: 15px;">Please Complete All Questions</h3>
            <div id="missingQuestionsList" style="text-align: left; margin-bottom: 20px;"></div>
            <p style="color: #666; margin-bottom: 20px;">Please answer all required questions before proceeding to the next page.</p>
            <button id="validationOkBtn" style="
                background: #3498db;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
                font-weight: bold;
                transition: background-color 0.3s;
            ">OK, I'll complete them</button>
        `;

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        document.getElementById('validationOkBtn').addEventListener('click', () => {
            hideValidationError();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideValidationError();
            }
        });
    }

    const questionsList = document.getElementById('missingQuestionsList');
    questionsList.innerHTML = '<strong>Missing answers for:</strong><ul>' +
        missingAnswers.map(q => `<li style="margin: 5px 0;">${q}</li>`).join('') +
        '</ul>';

    modal.style.display = 'flex';
    setTimeout(() => {
        modal.style.opacity = '1';
        modal.querySelector('div').style.transform = 'translateY(0)';
    }, 10);

    highlightMissingQuestions();
}

// Hide validation error modal
function hideValidationError() {
    const modal = document.getElementById('validationErrorModal');
    if (modal) {
        modal.style.opacity = '0';
        modal.querySelector('div').style.transform = 'translateY(-20px)';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
    removeQuestionHighlights();
}

// Highlight missing questions visually
function highlightMissingQuestions() {
    if (currentPageNum < 1 || currentPageNum > totalPages - 1) return;

    const currentPage = document.getElementById(`page${currentPageNum}`);
    if (!currentPage) return;

    const requiredQuestions = [
        `q${currentPageNum}_persuasive`,
        `q${currentPageNum}_diversity`
    ];

    requiredQuestions.forEach(questionName => {
        const radioGroup = currentPage.querySelectorAll(`input[name="${questionName}"]`);
        const isAnswered = Array.from(radioGroup).some(radio => radio.checked);

        if (!isAnswered) {
            const questionBox = currentPage.querySelector(`input[name="${questionName}"]`).closest('.question-box');
            questionBox.style.cssText += `
                border: 2px solid #e74c3c !important;
                background-color: #fdf2f2 !important;
                animation: shake 0.5s ease-in-out;
            `;

            if (!document.getElementById('shakeAnimation')) {
                const shakeStyle = document.createElement('style');
                shakeStyle.id = 'shakeAnimation';
                shakeStyle.textContent = `
                    @keyframes shake {
                        0%, 20%, 40%, 60%, 80% { transform: translateX(0); }
                        10%, 30%, 50%, 70% { transform: translateX(-5px); }
                        15%, 35%, 55%, 75% { transform: translateX(5px); }
                    }
                `;
                document.head.appendChild(shakeStyle);
            }
        }
    });
}

// Remove question highlights
function removeQuestionHighlights() {
    if (currentPageNum < 1 || currentPageNum > totalPages - 1) return;
    const currentPage = document.getElementById(`page${currentPageNum}`);
    if (!currentPage) return;

    const questionBoxes = currentPage.querySelectorAll('.question-box');
    questionBoxes.forEach(box => {
        box.style.border = '';
        box.style.backgroundColor = '';
        box.style.animation = '';
    });
}

// Save current page responses
function saveCurrentPageResponses() {
    if (currentPageNum === 0) {
        // User info page
        return validateUserInfo();
    }

    const currentPage = document.getElementById(`page${currentPageNum}`);
    if (!currentPage) return true;

    const inputs = currentPage.querySelectorAll('input[type="radio"]:checked, textarea');
    inputs.forEach(input => {
        if (input.value && input.value.trim() !== '') {
            responses[input.name] = input.value.trim();
        } else if (input.tagName === 'TEXTAREA' && !input.value.trim()) {
            // 빈 코멘트는 저장 안 함 (원하면 삭제 처리 가능)
            delete responses[input.name];
        }
    });

    // 👉 localStorage 저장(진행상황/응답/유저정보/현재페이지)
    localStorage.setItem('survey_responses', JSON.stringify(responses));
    localStorage.setItem('survey_userInfo', JSON.stringify(userInfo));
    localStorage.setItem('survey_currentPage', currentPageNum);

    return true;
}

// Navigation functions
function nextPage() {
    if (!validateCurrentPage()) return;

    if (currentPageNum === 0) {
        if (surveyData.length === 0) {
            showPage(-1, 'next');
            document.getElementById('loadingPage').classList.remove('hidden');
            return;
        }
    }

    saveCurrentPageResponses();

    if (currentPageNum < totalPages - 1) {
        showPage(currentPageNum + 1, 'next');
    } else {
        showThankYouPage();
    }

    // 👉 10번째마다(10,20,30,...) 클라이언트 자동 백업(한 페이지당 1회만)
    if (currentPageNum > 1 && currentPageNum % 10 === 1 && lastBackupPageNum !== currentPageNum) {
        console.log(`💾 Auto-saving backup at page ${currentPageNum}`);
        downloadResponses(true); // silent backup
        lastBackupPageNum = currentPageNum;
    }
}

function previousPage() {
    if (currentPageNum > 0) {
        saveCurrentPageResponses(); // 뒤로 가도 저장
        showPage(currentPageNum - 1, 'prev');
    }
}

// Show thank you page
async function showThankYouPage() {
    saveCurrentPageResponses();

    // Show loading indicator for final processing
    showLoadingIndicator();

    // 서버 저장은 유지(원하시면 비활성화 가능)
    const saved = await saveToServer();

    // 최종 자동 백업 파일 다운로드
    downloadResponses(false);

    // Generate summary
    const totalResponsesCount = Object.keys(responses).filter(key =>
        key.includes('persuasive') && !key.includes('comments')
    ).length;
    const completedPages = Math.floor(totalResponsesCount);

    let summary = `
        <p><strong>Participant:</strong> ${userInfo.name || ''} (${userInfo.email || ''})</p>
        <p><strong>Affiliation:</strong> ${userInfo.affiliation || ''}</p>
        <p><strong>Completed Pages:</strong> ${completedPages} out of ${totalPages - 1}</p>
        <p><strong>Total Responses:</strong> ${Object.keys(responses).length}</p>
    `;

    const saveStatus = saved ?
        '<p style="color: green; font-weight: bold;">✓ Responses successfully saved to server!</p>' :
        '<p style="color: orange; font-weight: bold;">⚠ Server save failed. Please use download button for backup.</p>';

    document.getElementById('responseSummary').innerHTML = saveStatus + summary;

    addPageTransitionStyles();

    const currentPage = document.querySelector('.page:not(.hidden)');
    if (currentPage) {
        currentPage.classList.add('fade-out');
    }

    setTimeout(() => {
        document.querySelector('.navigation').style.display = 'none';
        document.getElementById('thankYouPage').classList.remove('hidden');
        document.getElementById('thankYouPage').classList.add('fade-in');

        document.querySelectorAll('.page:not(#thankYouPage)').forEach(page => {
            page.classList.add('hidden');
            page.classList.remove('fade-out', 'fade-in');
        });

        document.getElementById('progressFill').style.width = '100%';

        scrollToTop();
        hideLoadingIndicator();
        flashCompletionIndicator();
    }, 200);
}

// Flash completion indicator
function flashCompletionIndicator() {
    let indicator = document.getElementById('completionIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'completionIndicator';
        indicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #27ae60;
            color: white;
            padding: 20px 30px;
            border-radius: 10px;
            font-size: 18px;
            font-weight: bold;
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.8);
            transition: all 0.5s ease;
            z-index: 10001;
            text-align: center;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        `;
        indicator.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 5px;">🎉</div>
            <div>Survey Completed!</div>
            <div style="font-size: 14px; margin-top: 5px; opacity: 0.9;">Thank you for your participation</div>
        `;
        document.body.appendChild(indicator);
    }

    setTimeout(() => {
        indicator.style.opacity = '1';
        indicator.style.transform = 'translate(-50%, -50%) scale(1)';
    }, 100);

    setTimeout(() => {
        indicator.style.opacity = '0';
        indicator.style.transform = 'translate(-50%, -50%) scale(0.8)';
    }, 3000);
}

// Save responses to server (마지막 페이지에서만 사용)
async function saveToServer() {
    try {
        const completeResponse = {
            userInfo: userInfo,
            responses: responses,
            surveyMetadata: {
                totalPages: totalPages - 1,
                completedAt: new Date().toISOString(),
                userAgent: navigator.userAgent,
                screenResolution: `${screen.width}x${screen.height}`
            }
        };

        const response = await fetch('/save_response', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(completeResponse)
        });

        const result = await response.json();

        if (result.success) {
            console.log('Response saved to server:', result.filename);
            return true;
        } else {
            console.error('Server save failed:', result.error);
            return false;
        }
    } catch (error) {
        console.error('Server communication error:', error);
        return false;
    }
}

// Download responses as (backup) JSON
function downloadResponses(silent = false) {
    const completeData = {
        userInfo: userInfo,
        responses: responses,
        surveyMetadata: {
            totalPages: totalPages - 1,
            savedAt: new Date().toISOString(),
            userAgent: navigator.userAgent
        }
    };

    const dataStr = JSON.stringify(completeData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;

    const emailPart = (userInfo.email || 'unknown').replace('@', '_at_');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `argument_survey_${emailPart}_${timestamp}.json`;

    link.download = filename;
    // 자동 다운로드 트리거
    link.click();

    console.log(silent ? `📥 Silent backup downloaded: ${filename}` : `📥 Downloaded: ${filename}`);
    URL.revokeObjectURL(url);
}

// Auto-save responses when user selects options
document.addEventListener('change', function (e) {
    const isRadio = e.target && e.target.type === 'radio';
    const isTextarea = e.target && e.target.tagName === 'TEXTAREA';

    if (isRadio || isTextarea) {
        if (currentPageNum > 0) { // Don't auto-save user info here
            saveCurrentPageResponses();
            removeQuestionHighlights();

            // 10번째마다 자동 백업(해당 페이지에서 최초 1회)
            if (currentPageNum % 10 === 0 && lastBackupPageNum !== currentPageNum) {
                downloadResponses(true);
                lastBackupPageNum = currentPageNum;
            }
        } else if (currentPageNum === 0) {
            // 유저 정보 변경 시도 시에도 저장
            validateUserInfo();
        }
    }
});

// Add keyboard support for modal
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('validationErrorModal');
        if (modal && modal.style.display === 'flex') {
            hideValidationError();
        }
    }

    if (e.key === 'Enter') {
        const modal = document.getElementById('validationErrorModal');
        if (modal && modal.style.display === 'flex') {
            hideValidationError();
        }
    }
});

// Auto-save periodically (every 30 seconds) to localStorage
setInterval(() => {
    if (currentPageNum > 0 && Object.keys(responses).length > 0) {
        localStorage.setItem('survey_responses', JSON.stringify(responses));
        localStorage.setItem('survey_userInfo', JSON.stringify(userInfo));
        localStorage.setItem('survey_currentPage', currentPageNum);
        console.log('⏱ Periodic auto-save to localStorage');
    }
}, 30000);


// let currentPageNum = 0; // Start at user info page
// let totalPages = 0;
// let surveyData = [];
// let responses = {};
// let userInfo = {};

// // Flash page change indicator
// function flashPageChangeIndicator() {
//     // Create or get page change indicator
//     let indicator = document.getElementById('pageChangeIndicator');
//     if (!indicator) {
//         indicator = document.createElement('div');
//         indicator.id = 'pageChangeIndicator';
//         indicator.style.cssText = `
//             position: fixed;
//             top: 20px;
//             right: 20px;
//             background: #3498db;
//             color: white;
//             padding: 8px 16px;
//             border-radius: 20px;
//             font-size: 14px;
//             font-weight: bold;
//             opacity: 0;
//             transform: translateY(-10px);
//             transition: all 0.3s ease;
//             z-index: 10000;
//             pointer-events: none;
//         `;
//         document.body.appendChild(indicator);
//     }

//     // Show indicator
//     indicator.textContent = `Page ${currentPageNum + 1} of ${totalPages}`;
//     indicator.style.opacity = '1';
//     indicator.style.transform = 'translateY(0)';

//     // Hide after 2 seconds
//     setTimeout(() => {
//         indicator.style.opacity = '0';
//         indicator.style.transform = 'translateY(-10px)';
//     }, 2000);
// }

// // Initialize page transitions on load
// document.addEventListener('DOMContentLoaded', function () {
//     updateNavigation();
//     updateProgressBar();
//     loadCSVData();

//     // Add transition styles immediately
//     addPageTransitionStyles();
//     createLoadingIndicator();
// });

// // Load CSV data
// async function loadCSVData() {
//     try {
//         // Try to load from the data folder
//         const response = await fetch('./data/survey_data.csv');
//         if (!response.ok) {
//             throw new Error(`HTTP error! status: ${response.status}`);
//         }

//         const csvText = await response.text();

//         Papa.parse(csvText, {
//             header: true,
//             skipEmptyLines: true,
//             dynamicTyping: false,
//             complete: function (results) {
//                 console.log('CSV loaded successfully:', results.data.length, 'rows');
//                 surveyData = results.data;
//                 processData();
//             },
//             error: function (error) {
//                 console.error('CSV parsing error:', error);
//                 showError('Error parsing CSV data: ' + error.message);
//             }
//         });
//     } catch (error) {
//         console.error('Failed to load CSV:', error);
//         showError('Failed to load survey data. Please make sure the CSV file exists in the data folder.');
//     }
// }

// // Process the loaded data and create survey pages
// function processData() {
//     if (!surveyData || surveyData.length === 0) {
//         showError('No data found in CSV file');
//         return;
//     }

//     // Assuming CSV structure:
//     // opinion, set_a_arg1, set_a_arg2, set_a_arg3, set_b_arg1, set_b_arg2, set_b_arg3
//     totalPages = surveyData.length + 1; // +1 for user info page
//     document.getElementById('totalPages').textContent = totalPages;

//     createSurveyPages();
//     console.log(`Created ${surveyData.length} survey pages`);
// }

// // Create survey pages dynamically
// function createSurveyPages() {
//     const container = document.querySelector('.container');
//     const navigation = document.querySelector('.navigation');

//     surveyData.forEach((row, index) => {
//         const pageDiv = document.createElement('div');
//         pageDiv.className = 'page hidden';
//         pageDiv.id = `page${index + 1}`;

//         pageDiv.innerHTML = `
//             <div class="content">
//                 <div class="opinion-section">
//                     <div class="opinion-title">Original Opinion:</div>
//                     <div class="opinion-text">${row.opinion || 'Opinion text not available'}</div>
//                 </div>

//                 <div class="sets-container">
//                     <div class="set-box">
//                         <div class="set-title">Set A</div>
//                         ${createArgumentItems(row, 'set_a', 3)}
//                     </div>

//                     <div class="set-box">
//                         <div class="set-title">Set B</div>
//                         ${createArgumentItems(row, 'set_b', 3)}
//                     </div>
//                 </div>

//                 <div class="questions-container">
//                     <div class="question-box">
//                         <div class="question-title">Which counterargument is most persuasive?</div>
//                         <div class="question-content">
//                             <div class="radio-group">
//                                 ${createRadioOptions(index + 1, 'persuasive', ['Set A-1', 'Set A-2', 'Set A-3', 'Set B-1', 'Set B-2', 'Set B-3', 'Hard to decide'])}
//                             </div>
//                             <div style="margin-top: 20px;">
//                                 <label for="q${index + 1}_persuasive_comments">Comments (optional):</label>
//                                 <textarea class="textarea" id="q${index + 1}_persuasive_comments" name="q${index + 1}_persuasive_comments"
//                                     placeholder="Please explain your reasoning..."></textarea>
//                             </div>
//                         </div>
//                     </div>

//                     <div class="question-box">
//                         <div class="question-title">Which set has more diverse counterarguments?</div>
//                         <div class="question-content">
//                             <div class="radio-group">
//                                 ${createRadioOptions(index + 1, 'diversity', ['Set A', 'Set B', 'Hard to decide'])}
//                             </div>
//                             <div style="margin-top: 20px;">
//                                 <label for="q${index + 1}_diversity_comments">Comments (optional):</label>
//                                 <textarea class="textarea" id="q${index + 1}_diversity_comments" name="q${index + 1}_diversity_comments"
//                                     placeholder="Please explain your reasoning..."></textarea>
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//             </div>
//         `;

//         container.insertBefore(pageDiv, navigation);
//     });
// }

// // Create argument items for a set
// function createArgumentItems(row, setPrefix, count) {
//     let html = '';
//     for (let i = 1; i <= count; i++) {
//         const argKey = `${setPrefix}_arg${i}`;
//         const argText = row[argKey] || `Argument ${i} not available`;

//         html += `
//             <div class="argument-item">
//                 <div class="argument-number">${i}.</div>
//                 <div class="argument-text">${argText}</div>
//             </div>
//         `;
//     }
//     return html;
// }

// // Create radio options
// function createRadioOptions(pageNum, questionType, options) {
//     return options.map(option => `
//         <label class="radio-option">
//             <input type="radio" name="q${pageNum}_${questionType}" value="${option}"> ${option}
//         </label>
//     `).join('');
// }

// // Show error message
// function showError(message) {
//     const errorDiv = document.createElement('div');
//     errorDiv.className = 'error';
//     errorDiv.innerHTML = `<strong>Error:</strong> ${message}`;

//     const content = document.querySelector('#loadingPage .content .loading');
//     content.innerHTML = '<h3>Error Loading Data</h3>';
//     content.appendChild(errorDiv);
// }

// // Update progress bar
// function updateProgressBar() {
//     const progress = totalPages > 0 ? (currentPageNum / totalPages) * 100 : 0;
//     document.getElementById('progressFill').style.width = progress + '%';
// }

// // Update navigation
// function updateNavigation() {
//     const prevBtn = document.getElementById('prevBtn');
//     const nextBtn = document.getElementById('nextBtn');
//     const currentPageSpan = document.getElementById('currentPage');

//     prevBtn.disabled = currentPageNum === 0;
//     currentPageSpan.textContent = currentPageNum + 1;

//     if (currentPageNum === 0) {
//         nextBtn.textContent = 'Start Survey';
//         prevBtn.style.visibility = 'hidden';
//     } else {
//         prevBtn.style.visibility = 'visible';
//         if (currentPageNum === totalPages) {
//             nextBtn.textContent = 'Complete';
//         } else {
//             nextBtn.textContent = 'Next';
//         }
//     }
// }

// // Scroll to top function
// function scrollToTop() {
//     // Smooth scroll to top
//     window.scrollTo({
//         top: 0,
//         left: 0,
//         behavior: 'smooth'
//     });

//     // Alternative method for older browsers or if smooth scroll doesn't work
//     if (window.scrollY > 0) {
//         // Force immediate scroll if smooth scroll didn't work
//         setTimeout(() => {
//             if (window.scrollY > 50) {
//                 window.scrollTo(0, 0);
//             }
//         }, 100);
//     }
// }

// // Add CSS for page transitions (inject into document)
// function addPageTransitionStyles() {
//     if (document.getElementById('pageTransitionStyles')) return; // Already added

//     const style = document.createElement('style');
//     style.id = 'pageTransitionStyles';
//     style.textContent = `
//         .page {
//             opacity: 1;
//             transform: translateX(0);
//             transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
//         }
        
//         .page.hidden {
//             opacity: 0;
//             transform: translateX(-20px);
//             pointer-events: none;
//         }
        
//         .page.fade-out {
//             opacity: 0;
//             transform: translateX(20px);
//         }
        
//         .page.fade-in {
//             opacity: 1;
//             transform: translateX(0);
//         }
        
//         /* Loading indicator for page transitions */
//         .page-transition-loading {
//             position: fixed;
//             top: 50%;
//             left: 50%;
//             transform: translate(-50%, -50%);
//             background: rgba(255, 255, 255, 0.9);
//             padding: 20px;
//             border-radius: 8px;
//             box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
//             z-index: 9999;
//             display: none;
//             align-items: center;
//             gap: 10px;
//         }
        
//         .page-transition-loading.active {
//             display: flex;
//         }
        
//         .spinner {
//             width: 20px;
//             height: 20px;
//             border: 2px solid #f3f3f3;
//             border-top: 2px solid #3498db;
//             border-radius: 50%;
//             animation: spin 1s linear infinite;
//         }
        
//         @keyframes spin {
//             0% { transform: rotate(0deg); }
//             100% { transform: rotate(360deg); }
//         }
        
//         /* Progress bar animation */
//         #progressFill {
//             transition: width 0.4s ease-out;
//         }
        
//         /* Button click feedback */
//         .nav-btn:active {
//             transform: translateY(1px);
//             transition: transform 0.1s;
//         }
        
//         /* Content fade effect */
//         .content {
//             animation: contentFadeIn 0.5s ease-in-out;
//         }
        
//         @keyframes contentFadeIn {
//             from {
//                 opacity: 0;
//                 transform: translateY(10px);
//             }
//             to {
//                 opacity: 1;
//                 transform: translateY(0);
//             }
//         }
//     `;
//     document.head.appendChild(style);
// }

// // Create loading indicator
// function createLoadingIndicator() {
//     if (document.getElementById('pageTransitionLoading')) return; // Already exists

//     const loadingDiv = document.createElement('div');
//     loadingDiv.id = 'pageTransitionLoading';
//     loadingDiv.className = 'page-transition-loading';
//     loadingDiv.innerHTML = `
//         <div class="spinner"></div>
//         <span>Loading next page...</span>
//     `;
//     document.body.appendChild(loadingDiv);
// }

// // Show loading indicator
// function showLoadingIndicator() {
//     const loading = document.getElementById('pageTransitionLoading');
//     if (loading) {
//         loading.classList.add('active');
//     }
// }

// // Hide loading indicator
// function hideLoadingIndicator() {
//     const loading = document.getElementById('pageTransitionLoading');
//     if (loading) {
//         loading.classList.remove('active');
//     }
// }

// // Show specific page with transition effect
// function showPage(pageNum, direction = 'next') {
//     // Add styles if not already added
//     addPageTransitionStyles();
//     createLoadingIndicator();

//     // Show loading indicator briefly
//     showLoadingIndicator();

//     // Get current visible page
//     const currentVisiblePage = document.querySelector('.page:not(.hidden)');

//     // First, fade out current page
//     if (currentVisiblePage) {
//         currentVisiblePage.classList.add('fade-out');
//     }

//     // Small delay for fade out effect
//     setTimeout(() => {
//         // Hide all pages
//         const pages = document.querySelectorAll('.page');
//         pages.forEach(page => {
//             page.classList.add('hidden');
//             page.classList.remove('fade-out', 'fade-in');
//         });

//         // Determine which page to show
//         let targetPage;
//         if (pageNum === 0) {
//             targetPage = document.getElementById('userInfoPage');
//         } else if (pageNum <= totalPages - 1) {
//             targetPage = document.getElementById(`page${pageNum}`);
//         } else {
//             targetPage = document.getElementById('thankYouPage');
//         }

//         // Show target page with fade in effect
//         if (targetPage) {
//             targetPage.classList.remove('hidden');
//             targetPage.classList.add('fade-in');

//             // Scroll to top immediately after showing
//             scrollToTop();
//         }

//         // Update page state
//         currentPageNum = pageNum;
//         updateProgressBar();
//         updateNavigation();

//         // Hide loading indicator
//         hideLoadingIndicator();

//         // Add a subtle flash effect to indicate page change
//         flashPageChangeIndicator();

//     }, 200); // 200ms delay for fade out
// }

// // Validate user info
// function validateUserInfo() {
//     const form = document.getElementById('userInfoForm');
//     const formData = new FormData(form);

//     const name = formData.get('userName').trim();
//     const email = formData.get('userEmail').trim();

//     if (!name || !email) {
//         alert('Please fill in all required fields (Name and Email).');
//         return false;
//     }

//     // Basic email validation
//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     if (!emailRegex.test(email)) {
//         alert('Please enter a valid email address.');
//         return false;
//     }

//     // Store user info
//     userInfo = {
//         name: name,
//         email: email,
//         affiliation: formData.get('userAffiliation').trim() || 'Not provided'
//     };

//     return true;
// }

// // Validate current page responses
// function validateCurrentPage() {
//     if (currentPageNum === 0) {
//         // User info page validation
//         return validateUserInfo();
//     }

//     if (currentPageNum > totalPages - 1 || currentPageNum < 1) {
//         return true; // No validation needed for non-survey pages
//     }

//     const currentPage = document.getElementById(`page${currentPageNum}`);
//     if (!currentPage) return true;

//     // Find all required radio groups on current page
//     const requiredQuestions = [
//         `q${currentPageNum}_persuasive`,
//         `q${currentPageNum}_diversity`
//     ];

//     const missingAnswers = [];

//     for (const questionName of requiredQuestions) {
//         const radioGroup = currentPage.querySelectorAll(`input[name="${questionName}"]`);
//         const isAnswered = Array.from(radioGroup).some(radio => radio.checked);

//         if (!isAnswered) {
//             // Find question title for user-friendly message
//             const questionBox = currentPage.querySelector(`input[name="${questionName}"]`).closest('.question-box');
//             const questionTitle = questionBox.querySelector('.question-title').textContent;
//             missingAnswers.push(questionTitle);
//         }
//     }

//     if (missingAnswers.length > 0) {
//         showValidationError(missingAnswers);
//         return false;
//     }

//     return true;
// }

// // Show validation error with visual feedback
// function showValidationError(missingAnswers) {
//     // Create or get validation error modal
//     let modal = document.getElementById('validationErrorModal');
//     if (!modal) {
//         modal = document.createElement('div');
//         modal.id = 'validationErrorModal';
//         modal.style.cssText = `
//             position: fixed;
//             top: 0;
//             left: 0;
//             width: 100%;
//             height: 100%;
//             background: rgba(0, 0, 0, 0.5);
//             display: flex;
//             justify-content: center;
//             align-items: center;
//             z-index: 10002;
//             opacity: 0;
//             transition: opacity 0.3s ease;
//         `;

//         const modalContent = document.createElement('div');
//         modalContent.style.cssText = `
//             background: white;
//             padding: 30px;
//             border-radius: 10px;
//             max-width: 500px;
//             margin: 20px;
//             text-align: center;
//             box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
//             transform: translateY(-20px);
//             transition: transform 0.3s ease;
//         `;

//         modalContent.innerHTML = `
//             <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
//             <h3 style="color: #e74c3c; margin-bottom: 15px;">Please Complete All Questions</h3>
//             <div id="missingQuestionsList" style="text-align: left; margin-bottom: 20px;"></div>
//             <p style="color: #666; margin-bottom: 20px;">Please answer all required questions before proceeding to the next page.</p>
//             <button id="validationOkBtn" style="
//                 background: #3498db;
//                 color: white;
//                 border: none;
//                 padding: 12px 24px;
//                 border-radius: 5px;
//                 cursor: pointer;
//                 font-size: 16px;
//                 font-weight: bold;
//                 transition: background-color 0.3s;
//             ">OK, I'll complete them</button>
//         `;

//         modal.appendChild(modalContent);
//         document.body.appendChild(modal);

//         // Add click handler for OK button
//         document.getElementById('validationOkBtn').addEventListener('click', () => {
//             hideValidationError();
//         });

//         // Add click handler for modal background
//         modal.addEventListener('click', (e) => {
//             if (e.target === modal) {
//                 hideValidationError();
//             }
//         });
//     }

//     // Update missing questions list
//     const questionsList = document.getElementById('missingQuestionsList');
//     questionsList.innerHTML = '<strong>Missing answers for:</strong><ul>' +
//         missingAnswers.map(q => `<li style="margin: 5px 0;">${q}</li>`).join('') +
//         '</ul>';

//     // Show modal with animation
//     modal.style.display = 'flex';
//     setTimeout(() => {
//         modal.style.opacity = '1';
//         modal.querySelector('div').style.transform = 'translateY(0)';
//     }, 10);

//     // Highlight missing questions on the page
//     highlightMissingQuestions();
// }

// // Hide validation error modal
// function hideValidationError() {
//     const modal = document.getElementById('validationErrorModal');
//     if (modal) {
//         modal.style.opacity = '0';
//         modal.querySelector('div').style.transform = 'translateY(-20px)';
//         setTimeout(() => {
//             modal.style.display = 'none';
//         }, 300);
//     }

//     // Remove highlights
//     removeQuestionHighlights();
// }

// // Highlight missing questions visually
// function highlightMissingQuestions() {
//     if (currentPageNum < 1 || currentPageNum > totalPages - 1) return;

//     const currentPage = document.getElementById(`page${currentPageNum}`);
//     if (!currentPage) return;

//     const requiredQuestions = [
//         `q${currentPageNum}_persuasive`,
//         `q${currentPageNum}_diversity`
//     ];

//     requiredQuestions.forEach(questionName => {
//         const radioGroup = currentPage.querySelectorAll(`input[name="${questionName}"]`);
//         const isAnswered = Array.from(radioGroup).some(radio => radio.checked);

//         if (!isAnswered) {
//             const questionBox = currentPage.querySelector(`input[name="${questionName}"]`).closest('.question-box');
//             questionBox.style.cssText += `
//                 border: 2px solid #e74c3c !important;
//                 background-color: #fdf2f2 !important;
//                 animation: shake 0.5s ease-in-out;
//             `;

//             // Add shake animation if not already defined
//             if (!document.getElementById('shakeAnimation')) {
//                 const shakeStyle = document.createElement('style');
//                 shakeStyle.id = 'shakeAnimation';
//                 shakeStyle.textContent = `
//                     @keyframes shake {
//                         0%, 20%, 40%, 60%, 80% { transform: translateX(0); }
//                         10%, 30%, 50%, 70% { transform: translateX(-5px); }
//                         15%, 35%, 55%, 75% { transform: translateX(5px); }
//                     }
//                 `;
//                 document.head.appendChild(shakeStyle);
//             }
//         }
//     });
// }

// // Remove question highlights
// function removeQuestionHighlights() {
//     if (currentPageNum < 1 || currentPageNum > totalPages - 1) return;

//     const currentPage = document.getElementById(`page${currentPageNum}`);
//     if (!currentPage) return;

//     const questionBoxes = currentPage.querySelectorAll('.question-box');
//     questionBoxes.forEach(box => {
//         box.style.border = '';
//         box.style.backgroundColor = '';
//         box.style.animation = '';
//     });
// }

// // Save current page responses
// function saveCurrentPageResponses() {
//     if (currentPageNum === 0) {
//         // User info page
//         return validateUserInfo();
//     }

//     const currentPage = document.getElementById(`page${currentPageNum}`);
//     if (!currentPage) return true;

//     const inputs = currentPage.querySelectorAll('input[type="radio"]:checked, textarea');
//     inputs.forEach(input => {
//         if (input.value && input.value.trim() !== '') {
//             responses[input.name] = input.value.trim();
//         }
//     });

//     return true;
// }

// // Navigation functions
// function nextPage() {
//     // Always validate current page before moving forward
//     if (!validateCurrentPage()) {
//         return; // Stop if validation fails
//     }

//     if (currentPageNum === 0) {
//         // Moving from user info to survey
//         if (surveyData.length === 0) {
//             // Show loading page while data loads
//             showPage(-1, 'next');
//             document.getElementById('loadingPage').classList.remove('hidden');
//             return;
//         }
//     }

//     // Save responses after validation passes
//     saveCurrentPageResponses();

//     if (currentPageNum < totalPages - 1) {
//         showPage(currentPageNum + 1, 'next');
//     } else {
//         // Show thank you page
//         showThankYouPage();
//     }
// }

// function previousPage() {
//     if (currentPageNum > 0) {
//         // No validation needed when going back
//         saveCurrentPageResponses();
//         showPage(currentPageNum - 1, 'prev');
//     }
// }

// // Show thank you page
// async function showThankYouPage() {
//     saveCurrentPageResponses();

//     // Show loading indicator for final processing
//     showLoadingIndicator();

//     // Auto-save to server
//     const saved = await saveToServer();
//     downloadResponses();
    
//     // Generate summary
//     const totalResponses = Object.keys(responses).filter(key =>
//         key.includes('persuasive') && !key.includes('comments')
//     ).length;

//     const completedPages = Math.floor(totalResponses);

//     let summary = `
//         <p><strong>Participant:</strong> ${userInfo.name} (${userInfo.email})</p>
//         <p><strong>Affiliation:</strong> ${userInfo.affiliation}</p>
//         <p><strong>Completed Pages:</strong> ${completedPages} out of ${totalPages - 1}</p>
//         <p><strong>Total Responses:</strong> ${Object.keys(responses).length}</p>
//     `;

//     // Save status
//     const saveStatus = saved ?
//         '<p style="color: green; font-weight: bold;">✓ Responses successfully saved to server!</p>' :
//         '<p style="color: orange; font-weight: bold;">⚠ Server save failed. Please use download button for backup.</p>';

//     document.getElementById('responseSummary').innerHTML = saveStatus + summary;

//     // Add transition styles
//     addPageTransitionStyles();

//     // Fade out current page first
//     const currentPage = document.querySelector('.page:not(.hidden)');
//     if (currentPage) {
//         currentPage.classList.add('fade-out');
//     }

//     setTimeout(() => {
//         // Hide navigation and show thank you page
//         document.querySelector('.navigation').style.display = 'none';
//         document.getElementById('thankYouPage').classList.remove('hidden');
//         document.getElementById('thankYouPage').classList.add('fade-in');

//         document.querySelectorAll('.page:not(#thankYouPage)').forEach(page => {
//             page.classList.add('hidden');
//             page.classList.remove('fade-out', 'fade-in');
//         });

//         // Update progress to 100%
//         document.getElementById('progressFill').style.width = '100%';

//         // Scroll to top for thank you page
//         scrollToTop();

//         // Hide loading indicator
//         hideLoadingIndicator();

//         // Show completion indicator
//         flashCompletionIndicator();

//     }, 200);
// }

// // Flash completion indicator
// function flashCompletionIndicator() {
//     let indicator = document.getElementById('completionIndicator');
//     if (!indicator) {
//         indicator = document.createElement('div');
//         indicator.id = 'completionIndicator';
//         indicator.style.cssText = `
//             position: fixed;
//             top: 50%;
//             left: 50%;
//             transform: translate(-50%, -50%);
//             background: #27ae60;
//             color: white;
//             padding: 20px 30px;
//             border-radius: 10px;
//             font-size: 18px;
//             font-weight: bold;
//             opacity: 0;
//             transform: translate(-50%, -50%) scale(0.8);
//             transition: all 0.5s ease;
//             z-index: 10001;
//             text-align: center;
//             box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
//         `;
//         indicator.innerHTML = `
//             <div style="font-size: 24px; margin-bottom: 5px;">🎉</div>
//             <div>Survey Completed!</div>
//             <div style="font-size: 14px; margin-top: 5px; opacity: 0.9;">Thank you for your participation</div>
//         `;
//         document.body.appendChild(indicator);
//     }

//     // Show indicator
//     setTimeout(() => {
//         indicator.style.opacity = '1';
//         indicator.style.transform = 'translate(-50%, -50%) scale(1)';
//     }, 100);

//     // Hide after 3 seconds
//     setTimeout(() => {
//         indicator.style.opacity = '0';
//         indicator.style.transform = 'translate(-50%, -50%) scale(0.8)';
//     }, 3000);
// }

// // Save responses to server
// async function saveToServer() {
//     try {
//         const completeResponse = {
//             userInfo: userInfo,
//             responses: responses,
//             surveyMetadata: {
//                 totalPages: totalPages - 1,
//                 completedAt: new Date().toISOString(),
//                 userAgent: navigator.userAgent,
//                 screenResolution: `${screen.width}x${screen.height}`
//             }
//         };

//         const response = await fetch('/save_response', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify(completeResponse)
//         });

//         const result = await response.json();

//         if (result.success) {
//             console.log('Response saved to server:', result.filename);
//             return true;
//         } else {
//             console.error('Server save failed:', result.error);
//             return false;
//         }
//     } catch (error) {
//         console.error('Server communication error:', error);
//         return false;
//     }
// }

// // Download responses as backup
// function downloadResponses() {
//     const completeData = {
//         userInfo: userInfo,
//         responses: responses,
//         surveyMetadata: {
//             totalPages: totalPages - 1,
//             completedAt: new Date().toISOString(),
//             userAgent: navigator.userAgent
//         }
//     };

//     const dataStr = JSON.stringify(completeData, null, 2);
//     const dataBlob = new Blob([dataStr], { type: 'application/json' });
//     const url = URL.createObjectURL(dataBlob);
//     const link = document.createElement('a');
//     link.href = url;

//     const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
//     const filename = `argument_survey_${userInfo.email.replace('@', '_at_')}_${timestamp}.json`;

//     link.download = filename;
//     link.click();
//     URL.revokeObjectURL(url);
// }

// // Auto-save responses when user selects options
// document.addEventListener('change', function (e) {
//     if (e.target.type === 'radio' || e.target.tagName === 'TEXTAREA') {
//         if (currentPageNum > 0) { // Don't auto-save user info
//             saveCurrentPageResponses();
//             // Remove highlights when user answers questions
//             removeQuestionHighlights();
//         }
//     }
// });

// // Add keyboard support for modal
// document.addEventListener('keydown', function (e) {
//     if (e.key === 'Escape') {
//         const modal = document.getElementById('validationErrorModal');
//         if (modal && modal.style.display === 'flex') {
//             hideValidationError();
//         }
//     }

//     if (e.key === 'Enter') {
//         const modal = document.getElementById('validationErrorModal');
//         if (modal && modal.style.display === 'flex') {
//             hideValidationError();
//         }
//     }
// });

// // Auto-save periodically (every 30 seconds)
// setInterval(() => {
//     if (currentPageNum > 0 && Object.keys(responses).length > 0) {
//         saveCurrentPageResponses();
//         console.log('Auto-saved responses');
//     }
// }, 30000);
