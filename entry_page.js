const basePointer = document.getElementById('base-pointer');
let baseURL = basePointer.src;
baseURL = baseURL.replace('preview/NeRFSynthetic.jpg', '')
const scenes = {
  'NeRFSynthetic': {
    name: 'Synthetic NeRF',
    scenes: {
      chair: null,
      drums: null,
      ficus: null,
      hotdog: null,
      lego: null,
      materials: null,
      mic: null,
      ship: null,
    }
  },
  'Synthetic_NSVF': {
    name: 'Synthetic NSVF',
    scenes: {
      Bike: null,
      Lifestyle: null,
      Palace: null,
      Robot: null,
      Spaceship: null,
      Steamtrain: null,
      Toad: null,
      Wineholder: null,
    }
  },
  'BlendedMVS': {
    name: 'Blended MVS',
    scenes: {
      Character: [0, 1, 0],
      Fountain: [0, -1, 0],
      Jade: null,
      Statues: [0, 1, 0]
    }
  },
  'TanksAndTemple': {
    name: 'Tanks and Temples',
    scenes: {
      Barn: null,
      Caterpillar: null,
      Family: null,
      Ignatius: null,
      Truck: null
    }
  },
  '360_v2': {
    name: 'MIPNeRF 360',
    scenes: {
      bicycle: null,
      bonsai: null,
      counter: null,
      garden: null,
      kitchen: null,
      room: null,
      treehill: null,
      stump: null,
      flowers: null,
    }
  }
}
const createCard = (dataset, scene, up, index) => {
  const figure = document.createElement('figure');
  if(index % 8 === 0) {
    figure.classList.add('figure', 'col-md-1', 'offset-md-2');
  } else {
    figure.classList.add('figure', 'col-md-1');
  }

  const img = document.createElement('img');
  img.src = `${baseURL}preview/${dataset}/${scene}.jpg`;
  img.classList.add('figure-img', 'img-fluid', 'rounded');
  figure.appendChild(img);

  const figcaption = document.createElement('figcaption');
  let figcaptionText = `<span style="text-transform: capitalize;">${scene}</span>`;
  figcaptionText += `<br>`;

  const getPPNGUrl = (qtype, up) => up ? `ppng.html?src=${baseURL}/data/${dataset}/ppng_${qtype}/${scene}.ppng&up=${up}&size=600`:`ppng.html?src=${baseURL}data/${dataset}/ppng_${qtype}/${scene}.ppng&size=600`
  if (dataset == '360_v2' & ((scene == 'flowers') || (scene == 'treehill'))) {
    figcaptionText += `N/A (licensing)`;
  } else{
    figcaptionText += `<a href="${getPPNGUrl(1, up)}"><small>P1</small></a>\n`;
    figcaptionText += `<a href="${getPPNGUrl(2, up)}"><small>P2</small></a>\n`;
    if(dataset == 'NeRFSynthetic'){
      figcaptionText += `<a href="${getPPNGUrl(3, up)}"><small>P3</small></a>`;
    } else {
      figcaptionText += `<a href="#" style="color: gray;" data-bs-toggle="tooltip" data-bs-title="Disabled due to size limits!"><small>P3</small></a>`;
    }
  }
  figcaption.innerHTML = figcaptionText;
  figure.appendChild(figcaption);
  return figure;
};
const ppngObjectRoot = document.getElementById('ppng-objects');
Object.entries(scenes).forEach(([dataset, {name, scenes}]) => {
  const h5 = document.createElement('h5');
  h5.classList.add('col-md-8', 'offset-md-2');
  h5.style.marginTop = '30px';
  h5.innerText = name;
  ppngObjectRoot.appendChild(h5);
  Object.entries(scenes).forEach(([scene, up], index) => {
    const figure = createCard(dataset, scene, up, index);
    ppngObjectRoot.appendChild(figure);
  })
});

const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl))