var currentPage = 0;
var totalHtmlFiles = 9;

function changePublication() {
	if (currentPage >= 0 && currentPage < totalHtmlFiles) {
		var currentPageUrl = document.getElementById("contentIFrame").src;
		currentPageUrl = currentPageUrl.substring(0, currentPageUrl.lastIndexOf("/") + 1);
		var nextPageUrl = currentPageUrl;
		if (currentPage !== 0)
			currentPageUrl = currentPageUrl + "publication-" + currentPage + ".html";
		else
			currentPageUrl = currentPageUrl + "publication" + ".html";
		document.getElementById("contentIFrame").src = currentPageUrl;
		if ((currentPage + 1) < totalHtmlFiles) {
			nextPageUrl = nextPageUrl + "publication-" + (currentPage + 1) + ".html";
			document.getElementById("dummyIFrame").src = nextPageUrl;
		}
		updatePageDots();
	}
}

function isDesktop() {
	return !window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

function showNextPage() {
	if (currentPage >= totalHtmlFiles - 1) {
		// Desktop: loop back to page 0 from the last page.
		if (isDesktop()) {
			currentPage = 0;
			changePublication();
			showHideArrows();
			return;
		}
		// Mobile: still forward the tap into the iframe so a text screen with an
		// unrevealed media section (e.g. a photo) can be swiped/tapped into view.
		// If there's truly nowhere left to go, the iframe-side handler no-ops.
	}
	var iframe = document.getElementById('contentIFrame');
	if (iframe && iframe.contentWindow) {
		iframe.contentWindow.postMessage({ type: 'triggerNext' }, '*');
	}
}

function showPreviousPage() {
	if (currentPage <= 0) return;
	var iframe = document.getElementById('contentIFrame');
	if (iframe && iframe.contentWindow) {
		iframe.contentWindow.postMessage({ type: 'triggerPrev' }, '*');
	}
}

function showHideArrows() {
	var zoomed = currentZoom > 1.05;
	document.getElementsByClassName("prev")[0].style.visibility = (currentPage === 0 || zoomed) ? "hidden" : "visible";
	var hideNext = ((!isDesktop() && currentPage === totalHtmlFiles - 1) || zoomed);
	document.getElementsByClassName("next")[0].style.visibility = hideNext ? "hidden" : "visible";
}

// ── Page dot indicator ───────────────────────────────────────
function buildPageDots() {
	var el = document.getElementById("pageDots");
	if (!el) return;
	el.innerHTML = '';
	for (var i = 0; i < totalHtmlFiles; i++) {
		var dot = document.createElement("span");
		dot.className = "dot" + (i === 0 ? " dot-active" : "");
		(function(idx) { dot.addEventListener("click", function() { currentPage = idx; changePublication(); showHideArrows(); }); })(i);
		el.appendChild(dot);
	}
}

function updatePageDots() {
	var dots = document.querySelectorAll("#pageDots .dot");
	dots.forEach(function(d, i) {
		d.className = "dot" + (i === currentPage ? " dot-active" : "");
	});
}

// ── Messages from iframe (swipe, zoom, navigate) ─────────────
var currentZoom = 1;

window.addEventListener("message", function (e) {
	if (!e.data || !e.data.type) return;
	if (e.data.type === "swipe") {
		if (e.data.dir === "left") {
			if (currentPage < totalHtmlFiles - 1) {
				showNextPage();
			} else if (e.data.mobile || window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
				// Mobile/touch device: swipe left on last page loops back to pub-1 (index 1)
				currentPage = 1;
				changePublication();
				showHideArrows();
			}
		} else if (e.data.dir === "right" && currentPage > 0) {
			showPreviousPage();
		}
	} else if (e.data.type === "zoom") {
		currentZoom = e.data.value || 1;
		showHideArrows();
		var dots = document.getElementById("pageDots");
		if (dots) dots.style.opacity = currentZoom > 1.05 ? "0" : "1";
	} else if (e.data.type === "navigate") {
		var newPage = (typeof e.data.page === 'number' && e.data.page >= 0) ? e.data.page : currentPage + 1;
		if (newPage >= 0 && newPage < totalHtmlFiles) {
			currentPage = newPage;
			changePublication();
			showHideArrows();
		} else if (newPage >= totalHtmlFiles && isDesktop()) {
			// Desktop: yellow nav button on last page loops back to page 0
			currentPage = 0;
			changePublication();
			showHideArrows();
		}
	} else if (e.data.type === "navigatePrev") {
		if (currentPage > 0) {
			--currentPage;
			changePublication();
			showHideArrows();
		}
	}
});

document.addEventListener("DOMContentLoaded", function () {
	buildPageDots();
});
