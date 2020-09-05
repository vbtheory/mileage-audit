
const FILTERABLES = {
    'ExpenseCategoryName': '#category-filter-dropdown'
}
const VISIBLE_COLUMNS = [
    'employeeid',
    'firstname',
    'lastname',
    'itemid',
    'transactionid',
    'reportid',
    'reportreference',
    'productname',
    'quantity',
    'currencyid',
    'grossamountcc',
    'countryname',
    'approvedby',
    'comment'
];
const TARGET_CATEGORY_COLUMN = 'ProductName';
const TARGET_PRODUCT_NAME = 'business mileage';
const API_BATCH_SIZE = 10;
const ELEMENTS_PER_PAGE = 100;
const DEFERRED_LOADING_SIZE = 5000;
const DEFERRED_LOADING_START_TRESHOLD = DEFERRED_LOADING_SIZE * 2;
const DEFERRED_LOADING_STOP_TRESHOLD = 9999999999;
const DEFERRED_LOADING_SLEEP = 250;


var stats = {};
var unprocessedLines = [];
var linesToDisplay = [];
var uploadDropzone;
var uploadedDataHeader;
var uploadedData;
var uploadedDataFilterables;
var displayedLinesCount;
var apiQueue;
var cellSeparator;
var idCounter;
var filters;
var apiQueueDone = true;
var stopDeferredLoading = true;
var loadingMore = false;


$(document).ready(function () {
    Dropzone.autoDiscover = false;
    $("#upload-dropzone").dropzone({
        url: "/",
        addRemoveLinks: true,
        autoProcessQueue: false,
        autoQueue: false,
        maxFiles: 1,
        init: function() {
            uploadDropzone = this;
        },
        accept: dropzoneOnAddedFile
    });
        
    $('.filter-dropdown').on('click', '.dropdown-item', function(e){
        e.preventDefault();

        var target = $(this).parents('.dropdown-menu').attr('data-target');
        var value = $(this).attr('data-value');
        $(target).val(value);
    })

    $(".btn-apply-filter").click(filterData);
    $(".btn-clear-filter").click(function(e){
        $('#filter-form').trigger('reset');
    })
});

$(window).scroll(function(e){
    if(loadingMore) return;

    var content_height = $(document).height();
    var content_scroll_pos = $(window).scrollTop();
    var window_height = $(window).height();

    if(content_height - content_scroll_pos - window_height < 100){
        loadingMore = true;
        loadMore();
    }
})

var dropzoneOnAddedFile = function(file){
    uploadedData = undefined;
    var reader = new FileReader();
    reader.addEventListener("loadend", function(e) { processFile(e)});
    reader.readAsText(file, 'ISO-8859-1');

    $('#uploaded-file-name').html('"' + file.name + '"');
    uploadDropzone.removeFile(file);
}

var processFile = function(e) {
    var result = event.target.result;

    uploadedData = {};
    uploadedDataFilterables = {};
    uploadedDataHeader = [];
    linesToDisplay = [];
    apiQueue = [];
    apiQueueDone = true;
    displayedLinesCount = 0;
    idCounter = 0;
    loadingMore = false;
    loadMoreWhenMoreAvailable = false;
    filters = { enabled: false };

    statUpdate('ok', 0);
    statUpdate('nok', 0);
    statUpdate('pend', 0);
    statUpdate('all', 0); 

    Object.keys(FILTERABLES).forEach(filterable => {
        var filterableId = FILTERABLES[filterable];
        $(filterableId).find('*').remove();

        uploadedDataFilterables[filterable] = [];
    });

    $('.table-container').html('');
    $('.main-content-inner').find('div').removeAttr('selected');
    $('.data-loader').attr('selected', '');
    $('#upload-modal').modal('hide');
    $('#filter-form').trigger('reset');

    if(!result) return;
    
    stopDeferredLoading = false;
    unprocessedLines = result.split('\n');
    
    var headerLine = unprocessedLines.shift();
    cellSeparator = headerLine.split(',').length > headerLine.split(';').length ? ',':';'; 
    
    statUpdate('all', unprocessedLines.length);
    statUpdate('pend', unprocessedLines.length);
    
    readHeader(headerLine);
    startProcessingLines(true);
    startApiQueue();
    
    showData();
}

var startProcessingLines = function(displayLines, loadAll){
    
    console.time("processingLines");
    console.log("a-a-a-a-a-a-a-a: startProcessingLines -> unprocessedLines.length", unprocessedLines.length);
    if(unprocessedLines.length == 0 || (stopDeferredLoading && !loadAll)) return;

    var loadSize = loadAll? unprocessedLines.length : Math.min(unprocessedLines.length, DEFERRED_LOADING_SIZE);
    var newLines = "";

    for (let i = 0; i < loadSize; i++) {
        if(stopDeferredLoading && !loadAll) return;

        var line = unprocessedLines.shift();
        
        if(!line || !line.trim()) continue;
        
        line = line.split(cellSeparator);

        if(!line.join('').trim()) continue;

        var lineObject = processLine(line);

        if(displayLines && i < ELEMENTS_PER_PAGE) newLines += generateLineHTML(lineObject);
        else linesToDisplay.push(lineObject._props.id);
    }

    if(displayLines) appendLinesToTable(newLines);
    if(loadMoreWhenMoreAvailable) {
        loadMoreWhenMoreAvailable = false;
        loadMore();
    }

    console.timeEnd('processingLines');
    console.log("a-a-a-a-a-a-a-a: startProcessingLines -> uploadedData", Object.keys(uploadedData).length);
    if(unprocessedLines.length == 0 || stopDeferredLoading || linesToDisplay.length >= DEFERRED_LOADING_STOP_TRESHOLD) return;

    setTimeout(function (){
        startProcessingLines(false)
    }, DEFERRED_LOADING_SLEEP);
}

var readHeader = function(line) {
    line = line.split(cellSeparator);
    
    $('.table-container').html('<table><thead><tr></tr></thead><tbody></tbody></table>');
    var headerElement = $('.table-container').find('table thead tr');

    line.forEach(function(cell){
        console.log("a-a-a-a-a-a-a-a: readHeader -> cell", cell);
        
        if(VISIBLE_COLUMNS.includes(cell.toLowerCase())) {
            headerElement.append('<th>' + cell + '</th>');
        }
        
        if (!cell) cell = 'NONAME-' + Math.random();

        uploadedDataHeader.push(cell);
    })
}

var processLine = function(line) {
    var lineObject = {};
    
    line.forEach(function(cell, index){
        var colName = uploadedDataHeader[index];
        
        if(!colName) return;
        
        lineObject[colName] = cell;

        if(FILTERABLES[colName] && !uploadedDataFilterables[colName].includes(cell)){
            uploadedDataFilterables[colName].push(cell);
            
            $(FILTERABLES[colName]).append('<a class="dropdown-item" href="#" data-value="' + cell + '">' + cell + '</a>');
        }
    })
    
    lineObject._props = {
        id: idCounter
    }
    
    var categoryName = lineObject[TARGET_CATEGORY_COLUMN];
    if(!categoryName || categoryName.toLowerCase() != TARGET_PRODUCT_NAME) {
        lineObject._props.ignore = true;
        statUpdate('pend', -1, true);
    } else {
        apiQueue.push(lineObject._props.id);
    }

    uploadedData[idCounter] = lineObject;
    idCounter++;

    return lineObject;
}

var generateLineHTML = function(lineObject) {
    if(lineObject._props.status) var cls = 'row-' + lineObject._props.status;
    else var cls = "";

    var row = '<tr class="' + cls + ' uploaded-data-line" data-id="' + lineObject._props.id + '">';
    
    uploadedDataHeader.forEach(function(colName, index){
        var cell = lineObject[colName];
        
        if(index == 0) idCell = cell;
        if(!colName || !VISIBLE_COLUMNS.includes(colName.toLowerCase())) return;
        
        row += '<td>' + cell + '</td>';
    })
    
    row += '</tr>';
    
    displayedLinesCount++;
    return row;
}

var appendLinesToTable = function(newLines){
    var bodyElement = $('.table-container').find('table tbody');
    bodyElement.append(newLines);
}

var loadMore = function(){
    if(linesToDisplay.length == 0) {
        if(!stopDeferredLoading) loadMoreWhenMoreAvailable = true; 

        return;
    }

    var newLines = "";
    var count = 0;
    var max = Math.min(linesToDisplay.length, ELEMENTS_PER_PAGE);

    for (var index = 0; index < linesToDisplay.length; index++) {
        var lineId = linesToDisplay.shift();
        var lineObject = uploadedData[lineId];

        if(!lineObject) continue;
        
        if(filters.enabled){
            if(!filterLine(lineObject._props.id)) continue;
        }

        newLines+=generateLineHTML(lineObject);
        count++;
        if(count == max) break;
    }

    if(linesToDisplay.length <= DEFERRED_LOADING_START_TRESHOLD) startProcessingLines(false, false);
    
    appendLinesToTable(newLines);
    startApiQueue();

    loadingMore = false;
}

var filterData = function(){
    console.time("filterData");
    // Stop the deferred loader & force load the rest of the data if any left
    $('.table-container').find('table tbody').html('');
    linesToDisplay = Object.keys(uploadedData);
    loadingMore = false;
    loadMoreWhenMoreAvailable = linesToDisplay.length == 0;
    
    filters = {
        status: $('#status-filter').val(),
        category: $('#category-filter').val(),
    };

    if(!filters.status && !filters.category) filters.enabled = false;
    else filters.enabled = true;
    
    loadMore();
    console.timeEnd('filterData');
}

var filterLine = function(id){
    var line = uploadedData[id];
    var valid = true;

    if(filters.status && (line._props.ignore || (line._props.status && line._props.status != filters.status))) valid = false;
    if(filters.category && line.ExpenseCategoryName != filters.category) valid = false;

    return valid;
}

var startApiQueue =  function(){
    if(!apiQueueDone)  return;

    apiQueueDone = false;
    processApiQueue();
}

var processApiQueue = function(){
    if(apiQueue.length == 0) {
        apiQueueDone = true;
        $(window).trigger('scroll');
        return;
    }
        
    var id = apiQueue.shift();
    var lineObject = uploadedData[id];

    if(!lineObject){
        return processApiQueue();
    }

    var data = {
        DepartmentID: parseInt(lineObject['DepartmentID']),
        Quantity: parseInt(lineObject['Quantity']),
        GrossamountCC: parseFloat(lineObject['GrossamountCC']),
        CountryID: parseInt(lineObject['CountryID']),
        ControllerID: parseInt(lineObject['ControllerID'])
    };

    $.ajax({
        url:'https://ml-audit.herokuapp.com/predict',
        method:'POST',
        cache: false,
        data: data,
        success: function(result) {
            console.log("a-a-a-a-a-a-a-a: processApiQueue -> result", result);
            if(result && JSON.parse(result)){
                result = JSON.parse(result);

                var val = parseInt(result["Prediction"]);
                uploadedData[id]._props.val = val;
                uploadedData[id]._props.status = val == 0 ?'nok':'ok';

                statUpdate(uploadedData[id]._props.status, 1, true);
                statUpdate('pend', -1, true);
                
                var row = $('.uploaded-data-line[data-id="' + id + '"]');
                row.addClass('row-' + uploadedData[id]._props.status);
                
                if(filters.status && uploadedData[id]._props.status != filters.status) {
                    row.addClass('row-fade-out');
                    row.fadeOut(500, () => row.remove());
                }
            }
    
            processApiQueue();
        },
        error: function(error){
            if(!uploadedData[id]._props.retries) uploadedData[id]._props.retries = 0;
            uploadedData[id]._props.retries ++;
            console.log("a-a-a-a-a-a-a-a: processApiQueue -> uploadedData[id]._props.retries", id, uploadedData[id]._props.retries);

            if(uploadedData[id]._props.retries < 5) apiQueue.push(id);
            else uploadedData[id]._props.ignore = true;
            console.log("a-a-a-a-a-a-a-a: processApiQueue -> error", error);
            processApiQueue();
        }
    })
}

var processApiQueueBatch = function(){
    setTimeout(() => {
        if(apiQueue.length == 0) {
            apiQueueDone = true;
            $(window).trigger('scroll');
            return;
        }
        var result = simulateApi(apiQueue.splice(0, API_BATCH_SIZE));

        Object.keys(result).forEach(function(id, index){
            var val = result[id];

            if(!uploadedData[id]) return;

            uploadedData[id]._props.val = val;
            uploadedData[id]._props.status = val < 0.25 ?'nok':'ok';

            var row = $('.uploaded-data-line[data-id="' + id + '"]');
            row.addClass('row-' + uploadedData[id]._props.status);

            if(filters.status && uploadedData[id]._props.status != filters.status) {
                row.addClass('row-fade-out');
                row.fadeOut(500, () => row.remove());
            }
        })

        if(apiQueue.length == 0) {
            apiQueueDone = true;
            $(window).trigger('scroll');
            return;
        }

        processApiQueue();
    }, Math.random() * 1000);
}

var simulateApi = function(ids){
    var result = {};

    for (let index = 0; index < ids.length; index++) {
        const id = ids[index];
        
        result [id] = Math.random();
    }

    return result;
}

var showData = function(){
    $('.main-content-inner').find('div').removeAttr('selected');
    $('.data-container').attr('selected', '');
    $('.btn-filter').show();
    $('.stats-table-container').show();
}

var statUpdate = function(name, value, increment){
    if(increment) value += stats[name];

    stats[name] = value;
    $('#stat-' + name).html(value);
}