$(function(){
    $('#game-load-modal').modal('show');
    chooseTheme = Math.random() < 0.5;
    if (chooseTheme) {
	    openingTheme.play();
	}
	else {
		openingRockTheme.play();
        // openingTheme.play();
	}
    renderSavedSets();
    // Coming back from the creator can restore this page from the browser's cache
    $(window).on('pageshow', function(e){
        if (e.originalEvent.persisted) {
            renderSavedSets();
        }
    });
    $('#saved-set-select').change(updateSelectedSetIssue);
    $('#play-set-button').click(function(){
        var result = SetsStore.get($('#saved-set-select').val());
        if (!result.ok) {
            showLoadError(result.error);
            renderSavedSets();
            return;
        }
        var issues = SetsStore.playabilityIssues(result.set.board);
        if (issues.length) {
            showLoadError(issues[0]);
            renderSavedSets();
            return;
        }
        startGame(result.set.board);
    });
    $('#kill-music-button').click(function(){
        openingTheme.pause();
        openingTheme.currentTime = 0;
        openingRockTheme.pause();
        openingRockTheme.currentTime = 0;
    });
    $('#play-music-button').click(function(){
        openingTheme.play();
        openingTheme.currentTime = 0;
        openingRockTheme.pause();
        openingRockTheme.currentTime = 0;
    });


    $('#next-round').unbind('click').click(function(e){
        e.stopPropagation();
        currentRound++;
        if (rounds[currentRound] === 'double-jeopardy' && !hasDoubleJeopardy()) {
            currentRound++;
        }
        if (currentRound == rounds.length) {
            $(this).prop('disabled', true);
            window.location.reload();
            return;
        }
        else if (currentRound >= rounds.length - 1) {
            $(this).text('New Game');
        }
        currentBoard = jsonData[rounds[currentRound]];
        $('.panel-heading').empty();
        $('#main-board').empty();
        loadBoard();
    });

    $('#end-round').unbind('click').click(function(e){
        e.stopPropagation();
        var endRoundSound = new Audio('./sounds/end_of_round.mp3');
        endRoundSound.play();
        $('.unanswered').removeClass('unanswered').unbind().css('cursor','not-allowed');
    });
    $(document).on('click', '.unanswered', function(){
        //event bound to clicking on a tile. it grabs the data from the click event, populates the modal, fires the modal, and binds the answer method
        var category = $(this).parent().data('category');
        var question = $(this).data('question');
        var value = currentBoard[category].questions[question].value;
        var isDailyDouble = 'daily-double' in currentBoard[category].questions[question] ?
            currentBoard[category].questions[question]['daily-double'] : false;

        if (isDailyDouble) {
            var dailyDoubleSound = new Audio('./sounds/daily_double.mp3');
            dailyDoubleSound.play();
            $('#daily-double-modal-title').empty().text(currentBoard[category].name + ' - $' + value);
            $('#daily-double-modal').modal('show');
        }
        else {
            showClue(category, question);
        }
        $('#daily-double-continue').click(function(){
            $('#daily-double-modal').modal('hide');
            showClue(category, question);
        });
		//$('#question-modal').on('loaded.bs.modal', resizeAnswerModal());
		$('#question-modal').on('shown.bs.modal', function (e) {
		  resizeAnswerModal();
		})
        handleAnswer();
    });
    $(document).on('click', '#final-jeopardy-question-button', function(){
        $(this).hide();
        $('#final-jeopardy-question').show();
        var revealSound = new Audio('./sounds/final_jeopardy.mp3');
        revealSound.play();
        $('#final-image').show();
        $('#final-jeopardy-logo-img').hide();
    });
    $(window).resize(function(){
	    var textHeight = Math.max.apply(null, ($('.category-title').map(function(){return $(this).height();})));
	    var width = Math.max.apply(null, ($('.category-title').map(function(){return $(this).parent().width();})));
	    // If possible to keep aspect ratio, switch to it.
	    //var aspectRatioHeight = width * .75;
	    var aspectRatioHeight = width * (9 / 16);
	    var height = Math.max(textHeight, aspectRatioHeight);
	    $('.category-title').height(height).width(width);
    });

});

var rounds = ['jeopardy', 'double-jeopardy', 'final-jeopardy'];
var jsonData;
var currentBoard;
var currentRound = 0;
var isTimerActive = false;
var timerMaxCount = 5;
var timerObject;
var timerCount;
var gameDataFile;
var openingRockTheme = new Audio('./sounds/theme_rock.mp3');
// TODO: Custom openingTheme with custom themes
var openingTheme = new Audio('./sounds/theme_modern.mp3');

function startGame(data) {
    // The load modal stays clickable while it fades out
    if (jsonData) {
        return;
    }
    jsonData = data;
    currentBoard = jsonData[rounds[currentRound]];
    loadBoard();
    openingTheme.pause();
    openingTheme.currentTime = 0;
    openingRockTheme.pause();
    openingRockTheme.currentTime = 0;
    // TODO: Custom Sound with themes
    var boardFillSound = new Audio('./sounds/board_fill.mp3');
    boardFillSound.play();
    $('#game-load-modal').modal('hide');
}

function showLoadError(message) {
    $('#game-load-error').text(message).show();
}

function renderSavedSets() {
    var select = $('#saved-set-select');
    var previous = select.val();
    var result = SetsStore.list();
    var sets = result.ok ? result.sets : [];
    var message = '';
    if (!result.ok) {
        message = result.error;
    }
    else if (sets.length === 0) {
        message = 'No saved sets yet. Create one with Manage question sets.';
    }
    $('#saved-sets-message').text(message).toggle(message !== '');
    $('#saved-set-picker').toggle(sets.length > 0);

    // Start on the most recent set that can be played
    var initial = sets.length ? sets[0].id : null;
    var foundPlayable = false;
    select.empty();
    $.each(sets, function(i, set){
        var issues = SetsStore.playabilityIssues(set.board);
        if (issues.length === 0 && !foundPlayable) {
            initial = set.id;
            foundPlayable = true;
        }
        select.append($('<option>').val(set.id).text(set.name + (issues.length ? ' (incomplete)' : '')));
    });
    if (previous && select.find('option').filter(function(){ return this.value === previous; }).length) {
        initial = previous;
    }
    select.val(initial);
    updateSelectedSetIssue();
}

function updateSelectedSetIssue() {
    var id = $('#saved-set-select').val();
    var result = id ? SetsStore.get(id) : null;
    var issues = result && result.ok ? SetsStore.playabilityIssues(result.set.board) : [];
    $('#saved-set-issue').text(issues.length ? 'Incomplete: ' + issues[0] : '').toggle(issues.length > 0);
    $('#play-set-button').prop('disabled', !id || issues.length > 0);
}

function escapeHtml(value) {
    return $('<div>').text(value == null ? '' : String(value)).html().replace(/"/g, '&quot;');
}

// Board files can come from anyone, so only image sources are allowed through
function imageSrc(image) {
    if (/^(https?:|data:image\/)/i.test(image)) {
        return image;
    }
    return /^[a-z][a-z0-9+.-]*:/i.test(image) ? null : './' + image;
}

function showImage(container, image, visible) {
    var src = image ? imageSrc(image) : null;
    container.empty();
    if (src) {
        container.append($('<img>').attr('src', src));
    }
    container.toggle(!!src && visible);
}


function runTimer() {
    timerObject = setTimeout(function(){
        timerCount++;
        $('.timer-set-' + timerCount).css('background-color', 'black');
        if (timerCount < timerMaxCount) {
            runTimer();
        }
        else {
            var timeUpAudio = new Audio('./sounds/time_up.mp3');
            timeUpAudio.play();
            // Doo doo doo
            resetTimer();
        }
    }, 1000);
}

function resetTimer() {
    clearTimeout(timerObject);
    isTimerActive = false;
    timerCount = 0;
    $('.timer-square').css('background-color', 'black');
}

function hasDoubleJeopardy() {
    return Array.isArray(jsonData['double-jeopardy']) && jsonData['double-jeopardy'].length > 0;
}

function showClue(category, question) {
    var value = currentBoard[category].questions[question].value;
    var questionImage = currentBoard[category].questions[question].image;
    $('#modal-clue-title').empty().text(currentBoard[category].name + ' - $' + value);
    $('#question').empty().text(currentBoard[category].questions[question].question);
    showImage($('#question-image'), questionImage, true);
    $('#question-modal').modal('show');
    $('#done-button').data('question', question).data('category', category);
}

function loadBoard() {
    //function that turns the board.json (loaded in the the currentBoard variable) into a jeopardy board
    var board = $('#main-board');
    if (rounds[currentRound] === "final-jeopardy") {
        finalQuestionImage = currentBoard['image'];
        $('#end-round').hide();
        $('#main-board-categories').append('<div class="text-center col-md-6 col-md-offset-3"><h2 class="category-text">' +
            escapeHtml(currentBoard['category']) + '</h2></div>').css('background-color', 'navy');
        finalImage = '<div id="final-image" class="text-center"></div>';
        board.append('<div class="text-center col-md-6 col-md-offset-3"><h2><img src="./images/final_jeopardy.png" id="final-jeopardy-logo-img"></h2>'+
        	finalImage + '<h2 id="final-jeopardy-question" class="question-text">' +
            escapeHtml(currentBoard['question']) + '</h2><button class="btn btn-primary" id="final-jeopardy-question-button">Show Question</button></div>').css('background-color', 'navy');
        $('#final-jeopardy-question').hide();
        showImage($('#final-image'), finalQuestionImage, false);
    }
    else {
        $('#end-round').show();
        board.css('background-color', 'black');
        var columns = currentBoard.length;

        // Floor of width/12, for Bootstrap column width appropriate for the number of categories
        var column_width = parseInt(12/columns);
        $.each(currentBoard, function(i,category){
            // Category
            var header_class = 'col-md-' + column_width;
            if (i === 0 && columns % 2 != 0){ //if the number of columns is odd, offset the first one by one to center them
                header_class += ' col-md-offset-1';
            }
            $('#main-board-categories').append('<div class="category ' + header_class
                + '"><div class="text-center well"><div class="category-title category-text text-center">' + escapeHtml(category.name)
                 + '</div></div><div class="clearfix"></div></div>').css('background-color', 'black');

            // Column
            var div_class = 'category col-md-' + column_width;
            if (i === 0 && columns % 2 != 0){
                div_class += ' col-md-offset-1';
            }
            board.append('<div class="' + div_class + '" id="cat-' +
                i + '" data-category="' + i + '"></div>');
            var column = $('#cat-'+i);

            $.each(category.questions, function(n,question){
                // Questions
                column.append('<div class="well question unanswered text-center" data-question="' +
                    n + '">$' + escapeHtml(question.value) + '</div>');
            });
        });
    }
    $('#main-board-categories').append('<div class="clearfix"></div>');
    var textHeight = Math.max.apply(null, ($('.category-title').map(function(){return $(this).height();})));
    var width = Math.max.apply(null, ($('.category-title').map(function(){return $(this).parent().width();})));
    // If possible to keep aspect ratio, switch to it.
    //var aspectRatioHeight = width * .75;
    var aspectRatioHeight = width * (9 / 16);
    var height = Math.max(textHeight, aspectRatioHeight);
    $('.category-title').height(height).width(width);

    /*
    var questionTextHeight = Math.max.apply(null, ($('.question').map(function(){return $(this).height();})));
    var questionWidth = Math.max.apply(null, ($('.question').map(function(){return $(this).parent().width();})));
    var questionAspectRatioHeight = questionWidth * (9/16);
    var questionFinalHeight = Math.max(questionTextHeight, questionAspectRatioHeight);
    $('.question').height(questionFinalHeight);
    */
}

function resizeAnswerModal() {
    var otherHeights = ($('#question-modal-content .modal-header, #question-modal-content .modal-footer').map(function(){return $(this).outerHeight();}));
    var totalModalHeight = $('#question-modal-content').height();
    for(var i=0; i < otherHeights.length; i++) { totalModalHeight -= otherHeights[i]; }
    var modalBodyObj = $('#question-modal-content .modal-body');
    var modalBodyPadding = modalBodyObj.innerHeight() - modalBodyObj.height();
    //modalBodyObj.outerHeight(totalModalHeight);
    modalBodyObj.css('height',(totalModalHeight - modalBodyPadding)); // Adjust again for padding

    questionCenterPadding = ($('#question-modal-body').height() - ($('#question-image').height() + $('#question').height()))/2;
    $('#question').css('padding-top', questionCenterPadding);

}

function handleAnswer(){
    $('#done-button').click(function(){
        var tile = $('div[data-category="' + $(this).data('category') + '"]>[data-question="' +
            $(this).data('question') + '"]')[0];
        $(tile).empty().append('&nbsp;<div class="clearfix"></div>').removeClass('unanswered').unbind().css('cursor','not-allowed');
        resetTimer();
        $('#question-modal').modal('hide');
    });

    $('#timer-grid').unbind("click").click(function(e){
        e.stopPropagation();
        if (isTimerActive) {
            resetTimer();
        }
        else {
            $('.timer-square').css('background-color', 'red');
            isTimerActive = true;
            timerCount = 0;
            runTimer();
        }
        //isTimerActive = isTimerActive ? false : true;
    });
}
