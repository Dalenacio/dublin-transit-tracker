function indexTabSwap(button) {
    if (button.classList.contains("index-tab-btn-rail")){
        document.getElementById("tab-content-rail").style.display = "block"
        document.getElementById("tab-content-bus").style.display = "none"
    } else if (button.classList.contains("index-tab-btn-bus")){
        document.getElementById("tab-content-bus").style.display = "block"
        document.getElementById("tab-content-rail").style.display = "none"
    }
};

function routeFilter(formText, listClass) {
    const entries = document.getElementsByClassName(listClass);

    if (formText == "" && listClass == "nav-search-dropdown-item"){
        for (const route of entries) { route.style.display = "none" };
    } else {
        for (const route of entries) {
            if (!route.innerHTML.toLowerCase().includes(formText.toLowerCase())){
                route.style.display = "none";
            } else {
                route.style.display = "block";
            };
        };
    };
};

function findRouteId(routeName){
    const cache = getCache()
    console.log(cache)
};