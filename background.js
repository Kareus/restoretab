var tablog = {};
var tabToUrl = {};
var tabstore = {};
var threshold = 1;
var tempRemain = 3;
var tabRemain = 20;
var newtab = "chrome://newtab/";
var backupUrls = {};

//Functions
function getTimeStamp() {
  return + new Date();
}

function saveWindowID(id, lastTabs) {
  var idList = [];
  chrome.storage.local.get(["closed"], function (result) {
    for (var i in result["closed"]) idList.push(result["closed"][i]);
    
    idList.push(id);
    while (idList.length >= tempRemain) {
      chrome.storage.local.remove(["lasttab_" + idList[0]]);
      idList.shift();
    }
    chrome.storage.local.set({["closed"] : idList});

    chrome.storage.local.set({["lasttab_" + id]: lastTabs});
    chrome.contextMenus.update("clear_windows", {enabled : true});
  });
}

function loadTabs(key) {
  chrome.windows.getCurrent(function (win) {
    backupUrls[win.id] = [];
    chrome.storage.local.get([key], function (result) {
      for (var i in result[key]) backupUrls[win.id].push(result[key][i]);

      if (backupUrls[win.id].length == 0) {
        delete backupUrls[win.id];
        return;
      }
      chrome.contextMenus.update("restore_tabs", {enabled : true});
      chrome.contextMenus.update("clear_windows", {enabled : true});
    });
  });
}

function initWindow(id) {
  tablog[id] = {};
  tabToUrl[id] = {};
  tabstore[id] = [];
}

function releaseWindow(id) {
  delete tablog[id];
  delete tabToUrl[id];
  delete tabstore[id];
  if (backupUrls[id] != null) delete backupUrls[id];
}

function restoreTabs(id) {
  for (var i in backupUrls[id]) chrome.tabs.create({"url" : backupUrls[id][i]});
  delete backupUrls[id];

  chrome.contextMenus.update("restore_tabs", {enabled : false});
  if (Object.keys(backupUrls).length == 0) chrome.contextMenus.update("clear_windows", {enabled : false});
}

function restoreTab(id) {
  var urls = tabstore[id];
  var restoreURL = urls[urls.length-1];
  tabstore[id].pop();

  chrome.tabs.create({"url": restoreURL});
  if (tabstore[id].length == 0) {
    chrome.contextMenus.update("restore_a_tab", {enabled : false});
    chrome.contextMenus.update("clear_tabs", {enabled : false});
  }
}

function clearTabs(id) {
  tabstore[id] = [];
  chrome.contextMenus.update("restore_a_tab", {enabled : false});
  chrome.contextMenus.update("clear_tabs", {enabled : false});
}

function clearWindows() {
  //remove all temp files for closed-window tabs
  backupUrls = {};

  chrome.storage.local.get(["closed"], function (result) {
    for (var id in result["closed"]) {
      chrome.storage.local.remove(["lasttab_" + id]);
    }
    
    chrome.storage.local.remove(["closed"]);
  });

  chrome.contextMenus.update("restore_tabs", {enabled : false});
  chrome.contextMenus.update("clear_windows", {enabled : false});
}

//Context Menu
chrome.contextMenus.create({
  id: "restore_a_tab",
  title: "Restore Tab",
  contexts: ["browser_action"],
  enabled: false,
  onclick: function() {
    chrome.windows.getCurrent(function (win) {
      var id = win.id;
      restoreTab(id);
    });
  }
});

chrome.contextMenus.create({
  id: "restore_tabs",
  title: "Restore Window",
  contexts: ["browser_action"],
  enabled: false,
  onclick: function() {
    chrome.windows.getCurrent(function (win) {
      var id = win.id;
      if (backupUrls[id] != null) {
        restoreTabs(id);
      }
    });
  }
});

chrome.contextMenus.create({
  id: "clear_tabs",
  title: "Clear Tab History",
  contexts: ["browser_action"],
  enabled: false,
  onclick: function() {
    chrome.windows.getCurrent(function (win) {
      var id = win.id;
      clearTabs(id);
    });
  }
});

chrome.contextMenus.create({
  id: "clear_windows",
  title: "Clear Window History",
  contexts: ["browser_action"],
  enabled: false,
  onclick: function() {
    clearWindows();
  }
})

//Window event
chrome.windows.onCreated.addListener(function (id) {
  initWindow(id);

  var idList = [];
  chrome.storage.local.get(["closed"], function (result) {
    if (result["closed"] == null) return;

    for (var i in result["closed"]) idList.push(result["closed"][i]);
    if (idList == null || idList.length == 0) return;

    var lastKey = idList[idList.length - 1];
    idList.pop();
    chrome.storage.local.set({["closed"] : idList});
    if (lastKey != null) loadTabs("lasttab_" + lastKey);
  });

});

chrome.windows.onFocusChanged.addListener(function (id) {
  chrome.contextMenus.update("restore_tabs", {enabled : backupUrls[id] != null});
  chrome.contextMenus.update("restore_a_tab", {enabled : tabstore[id] != null && tabstore[id].length > 0});
  chrome.contextMenus.update("clear_tabs", {enabled : tabstore[id] != null && tabstore[id].length > 0});
  chrome.contextMenus.update("clear_windows", {enabled : Object.keys(backupUrls).length > 0});
});

chrome.windows.onRemoved.addListener(function (id) {
  var tabList = [];
  for (var i in tabToUrl[id]) {
    if (tabToUrl[id][i] != newtab) tabList.push(tabToUrl[id][i]);
  }

  releaseWindow(id);

  if (tabList.length == 0) return; //empty window
  saveWindowID(id, tabList);
});

//Browser action event
chrome.browserAction.onClicked.addListener(function (tab) {
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
      chrome.windows.getCurrent(function (win) {
        var id = win.id;
        if (backupUrls[id] != null) {
          restoreTabs(id);
          return;
        } //restore tabs from the closed window

        if (tabstore[id].length == 0) return; //no tabs to restore

        restoreTab(id);
      });
    });
  });

//Tabs event
chrome.tabs.onCreated.addListener(function(tab) {
  chrome.windows.getCurrent(function (win) {
    var id = win.id;
    if (backupUrls[id] != null) {
      delete backupUrls[id];
      chrome.contextMenus.update("restore_tabs", {enabled : false});
      if (Object.keys(backupUrls).length == 0) chrome.contextMenus.update("clear_windows", {enabled : false});
    }

    if (tablog[id] == null) initWindow(id);
  
    tablog[id][tab.id] = getTimeStamp();
  });
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  chrome.windows.getCurrent(function (win) {
    var id = win.id;
    if (tabToUrl[id] == null) initWindow(id);
    tabToUrl[id][tabId] = tab.url;
  });
});

chrome.tabs.onRemoved.addListener(function (tabId, info) {
  
  var id = info.windowId;
  if (info.isWindowClosing) return; //window is closing
  if (tablog[id] == null) return; //no urls in tab

  chrome.windows.get(id, {populate : true}, function (window) {
    if (window.tabs.length == 0) return; //only one tab left, and it is closing => window would be closed
    var stamp = tablog[id][tabId];
    var url = tabToUrl[id][tabId];

    delete tablog[id][tabId];
    delete tabToUrl[id][tabId];

    if ((getTimeStamp() - stamp) / 1000 < threshold) return; //threshold for created tabs
    if (url == newtab) return; //we don't need newtab

    while (tabstore[id].length >= tabRemain) tabstore[id].shift();
    tabstore[id].push(url);

    chrome.contextMenus.update("restore_a_tab", {enabled : true});
    chrome.contextMenus.update("clear_tabs", {enabled : true});
  });
});
