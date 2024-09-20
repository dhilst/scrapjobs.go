const colors = [
  "#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#33FFF9",
  "#FF33D4", "#FFC300", "#C70039", "#900C3F", "#581845",
  "#DAF7A6", "#FFC0CB", "#FF4500", "#ADFF2F", "#FF6347",
  "#4682B4", "#FFD700", "#4B0082", "#8A2BE2", "#7FFF00",
  "#D2691E", "#FF8C00", "#20B2AA", "#FF1493", "#1E90FF",
  "#32CD32", "#FFB6C1", "#8B0000", "#3CB371", "#FFD700",
  "#DC143C", "#708090", "#A52A2A", "#FF69B4", "#B22222",
  "#F0E68C", "#00FA9A", "#8FBC8F", "#FF7F50", "#FFFACD",
  "#ADFF2F", "#FFDAB9", "#FF1493", "#E6E6FA", "#F08080",
  "#FA8072", "#00BFFF", "#7CFC00", "#FFDEAD", "#FF00FF",
  "#FFEC8B", "#B0E0E6", "#C71585", "#DDA0DD", "#FFE4B5",
  "#A0522D", "#C0C0C0", "#D3D3D3", "#D8BFD8", "#FFD700",
  "#B0C4DE", "#FF4500", "#5F9EA0", "#708090", "#FFB347",
  "#C0C0C0", "#B22222", "#7FFF00", "#B0E0E6", "#B8860B",
  "#FF6347", "#F4A460", "#D2B48C", "#D2691E", "#F0E68C",
  "#FFF8DC", "#00FF7F", "#40E0D0", "#4682B4", "#FF69B4",
  "#C71585", "#BDB76B", "#DAA520", "#FFFACD", "#FFE4E1",
  "#B0E0E6", "#3CB371", "#F5DEB3", "#B22222", "#98FB98",
  "#FFB6C1", "#FF4500", "#E0FFFF", "#B0C4DE", "#FFDAB9",
  "#ADFF2F", "#FFF0F5",
];

const specialTags = {
  "new": "#33FF57"
};


let hashStringToNumber;
if (window.crypto?.subtle) {
  // This implementation deepends on cypto which is only
  // available when using HTTPS or localhost
  hashStringToNumber = async (str, algo = "SHA-256") => {
    let strBuf = new TextEncoder().encode(str);
    return crypto.subtle.digest(algo, strBuf)
      .then(hash => {
        const view = new DataView(hash);
        return view.getUint32(0)
      });
  }
} else {
  // This implementation works on HTTP but it colides a lot. 
  hashStringToNumber = async (str) => {
    if (str.length < 4) {
      // Hack to avoid short strings to coliding so much
      str = str.repeat(3);
    }
    var hash = 0,
    i, chr;
    if (this.length === 0) return hash;
    for (i = 0; i < this.length; i++) {
      chr = this.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }
}

async function pickColor(tag) {
  if (tag in specialTags) {
    return specialTags[tag];
  }
  const idx = await hashStringToNumber(tag).then(n => n % colors.length);
  return colors[idx];
}

// Save a new tag in the local storage using url as key
async function addTag(url, newTag, event) {
  const currentTags = getTags(url);
  console.log("tags", url, currentTags);
  if (currentTags.indexOf(newTag) !== -1) {
    return;
  }
  const newTags = JSON.stringify(Array.from(new Set([...currentTags, newTag])));
  localStorage.setItem(url, newTags);
  const newTagElement = document.createElement("span")
  newTagElement.innerHTML = await tag(newTag);
  event.target.parentElement.querySelector(".tags").appendChild(newTagElement);
}

async function removeTag(url, tagToRemove, event) {
  const currentTags = getTags(url);
  if (currentTags.indexOf(tagToRemove) === -1) {
    return;
  }

  const newTags = JSON.stringify(currentTags.filter(x => x !== tagToRemove));
  localStorage.setItem(url, newTags)
  const tagsContainer = event.target.parentElement.querySelector(".tags");
  const child = Array.from(tagsContainer.childNodes)
    .find(x => x.textContent === tagToRemove);
  if (child !== undefined) {
    tagsContainer.removeChild(child);
  }
}


function getTags(url) {
  return JSON.parse(localStorage.getItem(url) || '[]')
}

const tag = async (tag) => {
  const color = await pickColor(tag);
  const style = (function(){
    switch (tag) {
      case "new":
        return "box-shadow: 1px 0px 30px #e51bc5;";
      default:
        return "";
    }
  })();
  return `<span class="tag" style="background-color: ${color}; ${style}">${tag}</span>`;
};


let secure = window.location.protocol.includes('https') ? 's':'';
var socket = new WebSocket("ws"+secure+"://" +
  window.location.host + "/ws/server");

socket.onopen = function(event) {
  console.log("WebSocket connected!");
}

socket.onmessage = async function(event) {
  const results = JSON.parse(event.data);
  if (results === null) {
    document.getElementById("output").innerhtml = `<em>No data!</em>`;
    return;
  };
  console.assert(Array.isArray(results));
  // Title Tags Url Rank Headline 
  const lis = await Promise.all(results.map(async result => {
    const resultLocalTags = await Promise.all(getTags(result.Url).map(tag)).then(strings => strings.join(""));
    const resultTags = await Promise.all(result.Tags.map(tag)).then(strings => strings.join(""));
    return `<li>
<h2>
<a href="${result.Url}" target="_blank" class="kanit-extrabold">${result.Title}</a>
</h2>
<span class="tags">
${resultTags}
${resultLocalTags}
</span>
<input class="cmd-input" placeholder=">"/>
<div>${result.Headline}</div>
</li>`
  })).then(x => x.join(""));

  const element = document.createElement("div");
  element.innerHTML = `<em>Total</em>: ${results.length}<ul>${lis}</ul>`;
  element.style.display = 'none';
  element.querySelectorAll("input").forEach(input => {
    input.addEventListener("keyup", async function(event) {
      console.log('keyup', event.target);
      event.preventDefault();
      // The enter key
      if (event.keyCode === 13) {
        const command = event.target.value;
        const url = event.target.parentElement.querySelector("a").href;
        console.assert(url !== undefined);

        if (command.startsWith("!")) {
          await addTag(url, command, event)
        } else if (command.startsWith("-")) {
          await removeTag(url, "!" + command.slice(1), event)
        }

        event.target.value = "";
      }
    });
  });
  document.getElementById("output").replaceChildren(element);
  // This is to fix a flickering of the a:visited style blinking
  // after each search.
  setTimeout(() => element.style.display = 'block', 50);
}

function throttle(delay, func) {
  let timeout = null;

  return arg => {
    if (!timeout) {
      func(arg);
      timeout=setTimeout(() => { timeout = null }, delay)
    }
  };
}

let lastQuery = null;
const sendKeyPress = throttle(100, Query => {
  // This happens when we move the cursor in the input
  // we do not want to send the same input again to the server
  if (Query === lastQuery) {
    return;
  }

  socket.send(JSON.stringify({ Query }))
  lastQuery = Query;
});

function searchKeyPress(e) {
  sendKeyPress(e.target.value);
}

function searchKeyPressDown(e) {
  if (e.keyIdentifier=='U+000A' ||
    e.keyIdentifier=='Enter' ||
    e.keyCode==13) {
    e.preventDefault();
    return false;
  }

  return true;
}

document.addEventListener("keydown", event => {
  switch (event.key) {
    case "/":
      event.preventDefault();
      document.querySelector(".search").focus();
      break;
  }
});
