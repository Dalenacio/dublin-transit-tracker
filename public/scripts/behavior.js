function indexTabSwap(button) {
    console.log(button)
    if (button.classList.contains("index-tab-btn-rail")){
        document.getElementById("tab-content-rail").style.display = "block"
        document.getElementById("tab-content-bus").style.display = "none"
    } else if (button.classList.contains("index-tab-btn-bus")){
        document.getElementById("tab-content-bus").style.display = "block"
        document.getElementById("tab-content-rail").style.display = "none"
    }
};

function routeFilter(formText) {
    const entries = document.getElementsByClassName("list-group-item")
    
    for (const route of entries) {
        if (!route.innerHTML.toLowerCase().includes(formText.toLowerCase())){
            route.style.display = "none"
        } else {
            route.style.display = "block"
        }
    }
}