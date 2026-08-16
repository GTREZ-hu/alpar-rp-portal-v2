(() => {
  const stage = document.getElementById('map3dStage');
  if (!stage || !window.THREE) return;

  const loaderPanel = document.getElementById('map3dLoader');
  const progressText = document.getElementById('map3dProgress');
  const statusText = document.getElementById('map3dStatus');
  const markerCount = document.getElementById('map3dMarkerCount');

  const ASSET_ROOT = 'zerodream_3dmap-main/html/obj/';
  const defaultCamera = {
    x: -6817.53520738839,
    y: 5122.667802130858,
    z: 2358.9515954296567
  };

  let camera;
  let controls;
  let scene;
  let renderer;
  let mapObject;
  let animationId = 0;
  let hoveredPoint = null;
  let markerGroup;
  let zoneGroup;
  let routeGroup;
  let raycastTargets = [];
  let disposed = false;
  let isAnimating = false;
  let lastRenderTime = 0;
  let hoverFrame = 0;
  let pendingHoverEvent = null;
  let demoTimer = 0;
  let demoPlayers = [];
  let demoTick = 0;
  let selectedPoint = null;
  let policeZoneRadius = 420;

  const mouse = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  const demoMarkers = [
    { id: 'player-self', type: 'player', label: 'Te', x: -272.18, y: -955.78, z: 165, color: '#4fe8ff' },
    { id: 'police-1', type: 'faction', label: 'LSPD', x: 447.12, y: -990.86, z: 78.16, color: '#5fa8ff' },
    { id: 'garage-legion', type: 'garage', label: 'Garazs', x: 215.8, y: -810.2, z: 80, color: '#f5c76b' },
    { id: 'item-drop', type: 'item', label: 'Drop', x: -51.01, y: -1113.63, z: 56.02, color: '#ff3154' }
  ];

  const demoAnchors = [
    { name: 'Legion', x: 215, y: -810, z: 80 },
    { name: 'LSPD', x: 447, y: -990, z: 78 },
    { name: 'Sandy', x: 1850, y: 3680, z: 85 },
    { name: 'Paleto', x: -1100, y: 5200, z: 80 },
    { name: 'Pier', x: -1680, y: -1070, z: 65 },
    { name: 'Airport', x: -1037, y: -2738, z: 80 },
    { name: 'Mirror', x: 1150, y: -640, z: 86 }
  ];

  const roadNodes = [
    { id: 'legion', x: 215, y: -810, z: 82 },
    { id: 'vespucci', x: -780, y: -1120, z: 72 },
    { id: 'airport', x: -1037, y: -2738, z: 78 },
    { id: 'pier', x: -1680, y: -1070, z: 68 },
    { id: 'lspd', x: 447, y: -990, z: 82 },
    { id: 'pillbox', x: 300, y: -590, z: 92 },
    { id: 'bennys', x: -205, y: -1324, z: 74 },
    { id: 'mirror', x: 1150, y: -640, z: 88 },
    { id: 'casino', x: 925, y: 46, z: 92 },
    { id: 'vinewood', x: 320, y: 420, z: 118 },
    { id: 'west_vinewood', x: -660, y: 320, z: 118 },
    { id: 'route68_west', x: -2550, y: 2300, z: 98 },
    { id: 'route68_mid', x: 250, y: 2600, z: 104 },
    { id: 'sandy', x: 1850, y: 3680, z: 90 },
    { id: 'grapeseed', x: 2450, y: 5000, z: 88 },
    { id: 'paleto', x: -1100, y: 5200, z: 88 },
    { id: 'chumash', x: -3000, y: 3000, z: 96 },
    { id: 'east_highway', x: 2550, y: 900, z: 96 }
  ];

  const roadEdges = [
    ['airport', 'vespucci'], ['vespucci', 'legion'], ['vespucci', 'pier'], ['vespucci', 'bennys'],
    ['bennys', 'legion'], ['legion', 'lspd'], ['legion', 'pillbox'], ['pillbox', 'vinewood'],
    ['lspd', 'mirror'], ['mirror', 'casino'], ['casino', 'vinewood'], ['vinewood', 'west_vinewood'],
    ['west_vinewood', 'route68_west'], ['route68_west', 'route68_mid'], ['route68_mid', 'sandy'],
    ['sandy', 'grapeseed'], ['grapeseed', 'paleto'], ['route68_west', 'chumash'], ['chumash', 'paleto'],
    ['mirror', 'east_highway'], ['east_highway', 'sandy'], ['route68_mid', 'east_highway']
  ];

  const createLightweightTerrain = () => {
    const group = new THREE.Group();
    group.name = 'GTAVLightweightTerrain';
    const terrainGeometry = new THREE.PlaneGeometry(14000, 14000, 28, 28);
    terrainGeometry.rotateX(-Math.PI / 2);
    terrainGeometry.vertices.forEach(vertex => {
      const distance = Math.hypot(vertex.x, vertex.z) / 7000;
      vertex.y = Math.max(0, distance - .35) * 150 + Math.sin(vertex.x * .0011) * 20 + Math.cos(vertex.z * .0013) * 16;
    });
    terrainGeometry.computeVertexNormals();
    const terrain = new THREE.Mesh(
      terrainGeometry,
      new THREE.MeshLambertMaterial({ color: 0x101820, emissive: 0x03080d, side: THREE.DoubleSide })
    );
    terrain.name = 'InteractiveTerrain';
    terrain.position.y = -35;
    group.add(terrain);

    const grid = new THREE.GridHelper(14000, 70, 0x24586d, 0x172a35);
    grid.position.y = -30;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach(material => { material.transparent = true; material.opacity = .34; });
    group.add(grid);

    roadEdges.forEach(([fromId, toId]) => {
      const from = roadNodes.find(node => node.id === fromId);
      const to = roadNodes.find(node => node.id === toId);
      if (!from || !to) return;
      group.add(createLinePath([
        Object.assign({}, from, { z: 34 }),
        Object.assign({}, to, { z: 34 })
      ], '#4fcfff', .46));
    });

    mapObject = group;
    raycastTargets = [terrain];
    scene.add(group);
  };

  const setStatus = text => {
    if (statusText) statusText.textContent = text;
  };

  const announceMapState = (name, detail = {}) => {
    document.body.dataset.mapState = name;
    window.dispatchEvent(new CustomEvent(`alpar3d:${name}`, { detail }));
  };

  const setProgress = value => {
    if (progressText) progressText.textContent = `${Math.max(0, Math.min(100, Math.round(value)))}%`;
  };

  const getPowerProfile = () => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const saveData = Boolean(connection && connection.saveData);
    const lowCoreDevice = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return {
      saveData,
      reducedMotion,
      pixelRatio: Math.min(window.devicePixelRatio || 1, saveData || lowCoreDevice ? 1.15 : 1.45),
      targetFps: saveData || reducedMotion ? 24 : 30
    };
  };

  if (window.location.protocol === 'file:') {
    window.location.replace('http://localhost:3000/map.html');
    return;
  }

  const worldToScene = ({ x = 0, y = 0, z = 0 }) => new THREE.Vector3(Number(x), Number(z), -Number(y));

  const sceneToWorld = point => ({
    x: point.x,
    y: -point.z,
    z: point.y
  });

  const makeLabelTexture = (text, color = '#4fe8ff', type = 'marker') => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const label = String(text || type).slice(0, 28);
    canvas.width = 512;
    canvas.height = 176;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.shadowBlur = 26;
    ctx.shadowColor = color;
    ctx.fillStyle = 'rgba(8, 12, 20, .82)';
    roundRect(ctx, 24, 34, 464, 104, 24);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    roundRect(ctx, 24, 34, 464, 104, 24);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(72, 86, 18, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 38px Arial, sans-serif';
    ctx.fillText(label, 110, 82);
    ctx.fillStyle = 'rgba(226, 235, 245, .78)';
    ctx.font = '700 20px Arial, sans-serif';
    ctx.fillText(type.toUpperCase(), 112, 112);

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  };

  const disposeMarkerObject = marker => {
    marker.traverse(child => {
      if (child.material && child.material.map) child.material.map.dispose();
      if (child.geometry && typeof child.geometry.dispose === 'function') child.geometry.dispose();
      if (child.material && typeof child.material.dispose === 'function') child.material.dispose();
    });
  };

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  const createLabelSprite = marker => {
    const texture = makeLabelTexture(marker.label, marker.color, marker.type || 'marker');
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = marker.id;
    sprite.userData = Object.assign({}, marker, { texture });
    sprite.position.copy(worldToScene(marker));
    sprite.scale.set(340, 116, 1);
    return sprite;
  };

  const createCharacterMarker = marker => {
    const color = new THREE.Color(marker.color || (marker.type === 'police' ? '#5fa8ff' : '#4fe8ff'));
    const group = new THREE.Group();
    group.name = marker.id;
    group.userData = Object.assign({}, marker, { model3d: true });
    group.position.copy(worldToScene(marker));

    const bodyMaterial = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: .16 });
    const darkMaterial = new THREE.MeshLambertMaterial({ color: 0x071019, emissive: 0x071019 });
    const ringMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: .86 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(16, 22, 62, 10), bodyMaterial);
    body.position.y = 62;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(17, 12, 10), bodyMaterial);
    head.position.y = 108;
    group.add(head);

    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0, 15, 38, 10), darkMaterial);
    pin.position.y = 16;
    pin.rotation.x = Math.PI;
    group.add(pin);

    const ringGeometry = new THREE.Geometry();
    for (let index = 0; index <= 28; index += 1) {
      const angle = index / 28 * Math.PI * 2;
      ringGeometry.vertices.push(new THREE.Vector3(Math.cos(angle) * 42, 8, Math.sin(angle) * 42));
    }
    group.add(new THREE.Line(ringGeometry, ringMaterial));

    const label = createLabelSprite(Object.assign({}, marker, { label: marker.label || 'Player' }));
    label.position.set(0, 170, 0);
    label.scale.set(190, 66, 1);
    group.add(label);
    return group;
  };

  const createMarker = marker => {
    if (marker.type === 'player' || marker.type === 'police') return createCharacterMarker(marker);
    return createLabelSprite(marker);
  };

  const updateMarkerCount = () => {
    if (markerCount) markerCount.textContent = markerGroup ? markerGroup.children.length : 0;
  };

  const clearMarkers = () => {
    if (!markerGroup) return;
    markerGroup.children.forEach(disposeMarkerObject);
    while (markerGroup.children.length) {
      markerGroup.remove(markerGroup.children[0]);
    }
    updateMarkerCount();
  };

  const disposeLine = line => {
    if (line.geometry && typeof line.geometry.dispose === 'function') line.geometry.dispose();
    if (line.material && typeof line.material.dispose === 'function') line.material.dispose();
  };

  const clearZones = () => {
    if (!zoneGroup) return;
    zoneGroup.children.forEach(disposeLine);
    while (zoneGroup.children.length) {
      zoneGroup.remove(zoneGroup.children[0]);
    }
  };

  const createCircleZone = zone => {
    const center = worldToScene(zone);
    const radius = Number(zone.radius || 240);
    const segments = Math.max(24, Math.min(72, Number(zone.segments || 36)));
    const geometry = new THREE.Geometry();
    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      geometry.vertices.push(new THREE.Vector3(
        center.x + Math.cos(angle) * radius,
        center.y + Number(zone.height || 22),
        center.z + Math.sin(angle) * radius
      ));
    }
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(zone.color || '#5fa8ff'),
      transparent: true,
      opacity: Number(zone.opacity || .82),
      linewidth: 2
    });
    const line = new THREE.Line(geometry, material);
    line.name = zone.id;
    line.userData = Object.assign({}, zone, { pulse: Math.random() * Math.PI * 2 });
    return line;
  };

  const createBoxZone = zone => {
    const center = worldToScene(zone);
    const width = Number(zone.width || 420);
    const depth = Number(zone.depth || 260);
    const y = center.y + Number(zone.height || 24);
    const geometry = new THREE.Geometry();
    geometry.vertices.push(
      new THREE.Vector3(center.x - width / 2, y, center.z - depth / 2),
      new THREE.Vector3(center.x + width / 2, y, center.z - depth / 2),
      new THREE.Vector3(center.x + width / 2, y, center.z + depth / 2),
      new THREE.Vector3(center.x - width / 2, y, center.z + depth / 2),
      new THREE.Vector3(center.x - width / 2, y, center.z - depth / 2)
    );
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(zone.color || '#5fa8ff'),
      transparent: true,
      opacity: Number(zone.opacity || .75),
      linewidth: 2
    });
    const line = new THREE.Line(geometry, material);
    line.name = zone.id;
    line.userData = Object.assign({}, zone, { pulse: Math.random() * Math.PI * 2 });
    return line;
  };

  const setZones = zones => {
    clearZones();
    zones.slice(0, 8).forEach(zone => {
      zoneGroup.add(zone.shape === 'box' ? createBoxZone(zone) : createCircleZone(zone));
    });
  };

  const setMarkers = markers => {
    clearMarkers();
    markers.forEach(marker => markerGroup.add(createMarker(marker)));
    updateMarkerCount();
  };

  const randomBetween = (min, max) => min + Math.random() * (max - min);

  const distance2d = (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));

  const roadNodeById = id => roadNodes.find(node => node.id === id);

  const nearestRoadNode = point => roadNodes.reduce((best, node) => {
    const distance = distance2d(point, node);
    return !best || distance < best.distance ? { node, distance } : best;
  }, null).node;

  const getRoadNeighbors = id => roadEdges.reduce((neighbors, edge) => {
    if (edge[0] === id) neighbors.push(edge[1]);
    if (edge[1] === id) neighbors.push(edge[0]);
    return neighbors;
  }, []);

  const findRoadPath = (startPoint, endPoint) => {
    const start = nearestRoadNode(startPoint);
    const end = nearestRoadNode(endPoint);
    const distances = {};
    const previous = {};
    const queue = roadNodes.map(node => node.id);
    roadNodes.forEach(node => {
      distances[node.id] = node.id === start.id ? 0 : Infinity;
    });

    while (queue.length) {
      queue.sort((a, b) => distances[a] - distances[b]);
      const current = queue.shift();
      if (current === end.id) break;
      getRoadNeighbors(current).forEach(neighbor => {
        if (!queue.includes(neighbor)) return;
        const currentNode = roadNodeById(current);
        const neighborNode = roadNodeById(neighbor);
        const nextDistance = distances[current] + distance2d(currentNode, neighborNode);
        if (nextDistance < distances[neighbor]) {
          distances[neighbor] = nextDistance;
          previous[neighbor] = current;
        }
      });
    }

    const path = [];
    let cursor = end.id;
    while (cursor) {
      path.unshift(roadNodeById(cursor));
      if (cursor === start.id) break;
      cursor = previous[cursor];
    }
    return path.length ? path : [start, end];
  };

  const randomNear = (anchor, radius = 420) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * radius;
    return {
      x: anchor.x + Math.cos(angle) * distance,
      y: anchor.y + Math.sin(angle) * distance,
      z: anchor.z + randomBetween(-8, 24)
    };
  };

  const createDemoEntities = () => {
    const playerNames = ['Makai', 'Nora', 'Bence', 'Alex', 'Dani', 'Lili', 'Mark', 'Ricsi', 'Tomi', 'Zara', 'Viktor', 'Mira'];
    demoPlayers = playerNames.slice(0, 12).map((name, index) => {
      const anchor = demoAnchors[index % demoAnchors.length];
      const point = randomNear(anchor, 520);
      return Object.assign({
        id: `demo-player-${index + 1}`,
        type: 'player',
        label: name,
        color: '#4fe8ff',
        anchor,
        speed: randomBetween(18, 46)
      }, point);
    });

    const policeUnits = ['LSPD-1', 'LSPD-2', 'BCSO', 'SWAT'].map((label, index) => {
      const anchor = demoAnchors[(index + 1) % demoAnchors.length];
      return Object.assign({
        id: `demo-police-${index + 1}`,
        type: 'police',
        label,
        color: '#5fa8ff',
        anchor,
        speed: randomBetween(10, 28)
      }, randomNear(anchor, 340));
    });

    const serviceMarks = [
      { id: 'demo-garage-legion', type: 'garage', label: 'Legion Garage', color: '#f5c76b', x: 215.8, y: -810.2, z: 80 },
      { id: 'demo-hospital', type: 'ems', label: 'Pillbox EMS', color: '#7cffb2', x: 300.5, y: -590.2, z: 90 },
      { id: 'demo-mechanic', type: 'mechanic', label: 'Bennys', color: '#f5c76b', x: -205.6, y: -1324.4, z: 72 },
      { id: 'demo-drop-1', type: 'event', label: 'Event', color: '#ff3154', x: -1680, y: -1070, z: 65 },
      { id: 'demo-drop-2', type: 'item', label: 'Drop', color: '#ff3154', x: 1850, y: 3680, z: 85 }
    ];

    const zones = [
      { id: 'zone-police-legion', type: 'police-zone', label: 'Lezart terulet', x: 215, y: -810, z: 80, radius: 360, color: '#5fa8ff', opacity: .78 },
      { id: 'zone-investigation-lspd', type: 'investigation', label: 'Nyomozas', x: 447, y: -990, z: 78, width: 520, depth: 340, shape: 'box', color: '#5fa8ff', opacity: .7 },
      { id: 'zone-event-sandy', type: 'event-zone', label: 'Event zona', x: 1850, y: 3680, z: 85, radius: 430, color: '#f5c76b', opacity: .62 }
    ];

    return {
      players: [demoMarkers[0]].concat(demoPlayers, policeUnits),
      items: serviceMarks.filter(mark => mark.type === 'item' || mark.type === 'event'),
      marks: serviceMarks.filter(mark => mark.type !== 'item' && mark.type !== 'event'),
      zones
    };
  };

  const moveDemoPlayers = () => {
    if (!demoPlayers.length || document.hidden || disposed) return;
    demoTick += 1;
    demoPlayers.forEach((player, index) => {
      const angle = demoTick * .14 + index * .9;
      const orbit = 180 + (index % 4) * 55;
      player.x += Math.cos(angle) * (player.speed * .16);
      player.y += Math.sin(angle * .82) * (player.speed * .14);
      const driftFromAnchor = Math.hypot(player.x - player.anchor.x, player.y - player.anchor.y);
      if (driftFromAnchor > orbit * 2.2) {
        const next = randomNear(player.anchor, orbit);
        player.x = next.x;
        player.y = next.y;
        player.z = next.z;
      }
      updateMarker(player);
    });
  };

  const startDemoSimulation = () => {
    window.Alpar3DMap.randomizeDemo();
    if (demoTimer) window.clearInterval(demoTimer);
    demoTimer = window.setInterval(moveDemoPlayers, 1400);
  };

  const stopDemoSimulation = () => {
    if (demoTimer) window.clearInterval(demoTimer);
    demoTimer = 0;
  };

  const addMarker = marker => {
    removeMarker(marker.id);
    markerGroup.add(createMarker(marker));
    updateMarkerCount();
  };

  const removeMarker = id => {
    const selected = markerGroup.getObjectByName(id);
    if (!selected) return false;
    disposeMarkerObject(selected);
    markerGroup.remove(selected);
    updateMarkerCount();
    return true;
  };

  const disposeMaterial = material => {
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach(entry => {
      Object.keys(entry).forEach(key => {
        const value = entry[key];
        if (value && typeof value.dispose === 'function') value.dispose();
      });
      if (typeof entry.dispose === 'function') entry.dispose();
    });
  };

  const disposeObject = object => {
    if (!object) return;
    object.traverse(child => {
      if (child.geometry && typeof child.geometry.dispose === 'function') child.geometry.dispose();
      disposeMaterial(child.material);
    });
  };

  const clearRouteLayer = () => {
    if (!routeGroup) return;
    routeGroup.children.forEach(disposeObject);
    while (routeGroup.children.length) {
      routeGroup.remove(routeGroup.children[0]);
    }
  };

  const getSelfWorld = () => {
    const self = markerGroup && markerGroup.getObjectByName('player-self');
    if (!self) return demoMarkers[0];
    return sceneToWorld(self.position);
  };

  const createLinePath = (points, color = '#4fe8ff', opacity = .9) => {
    const geometry = new THREE.Geometry();
    points.forEach(point => geometry.vertices.push(worldToScene(point)));
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity,
      linewidth: 3
    });
    return new THREE.Line(geometry, material);
  };

  const createSelectionPin = point => {
    const group = new THREE.Group();
    group.name = 'selected-route-target';
    group.position.copy(worldToScene(point));
    const color = new THREE.Color('#f5c76b');
    const material = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: .22 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(28, 16, 12), material);
    head.position.y = 105;
    group.add(head);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0, 26, 86, 16), material);
    cone.position.y = 48;
    cone.rotation.x = Math.PI;
    group.add(cone);
    return group;
  };

  const createSelectedPoliceZone = (point, radius = policeZoneRadius) => createCircleZone({
    id: 'selected-police-radius',
    type: 'police-radius',
    label: 'Kijelolt lezart kor',
    x: point.x,
    y: point.y,
    z: point.z,
    radius,
    color: '#5fa8ff',
    opacity: .86,
    segments: 56,
    height: 34
  });

  function updateRouteToSelection() {
    if (!selectedPoint || !routeGroup || !markerGroup) return;
    clearRouteLayer();
    const start = getSelfWorld();
    const roadPath = findRoadPath(start, selectedPoint).map(point => Object.assign({}, point, { z: (point.z || 80) + 22 }));
    const route = createLinePath(roadPath, '#f5c76b', .94);
    route.name = 'selected-route-line';
    routeGroup.add(route);
    routeGroup.add(createSelectedPoliceZone(selectedPoint, policeZoneRadius));
    routeGroup.add(createSelectionPin(selectedPoint));
    announceMapState('route', {
      from: start,
      to: selectedPoint,
      roadNodes: roadPath.map(point => point.id).filter(Boolean),
      distance: roadPath.reduce((total, point, index) => index ? total + distance2d(roadPath[index - 1], point) : 0, 0)
    });
  }

  const setSelectedPoint = (point, options = {}) => {
    selectedPoint = {
      x: Number(point.x || 0),
      y: Number(point.y || 0),
      z: Number(point.z || 0)
    };
    if (options.radius !== undefined) policeZoneRadius = Math.max(50, Math.min(2200, Number(options.radius) || policeZoneRadius));
    updateRouteToSelection();
    announceMapState('selection', { point: selectedPoint, radius: policeZoneRadius });
  };

  const setPoliceZoneRadius = radius => {
    policeZoneRadius = Math.max(50, Math.min(2200, Number(radius) || policeZoneRadius));
    updateRouteToSelection();
    announceMapState('radius', { radius: policeZoneRadius });
  };

  const destroy = () => {
    if (disposed) return;
    disposed = true;
    stopRenderLoop();
    if (hoverFrame) cancelAnimationFrame(hoverFrame);
    stage.removeEventListener('pointermove', updateHoverPoint);
    stage.removeEventListener('dblclick', handleWaypoint);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    clearMarkers();
    clearZones();
    clearRouteLayer();
    stopDemoSimulation();
    disposeObject(mapObject);
    if (mapObject && scene) scene.remove(mapObject);
    if (markerGroup && scene) scene.remove(markerGroup);
    if (zoneGroup && scene) scene.remove(zoneGroup);
    if (routeGroup && scene) scene.remove(routeGroup);
    raycastTargets = [];
    if (controls && typeof controls.dispose === 'function') controls.dispose();
    if (renderer) {
      renderer.dispose();
      if (typeof renderer.forceContextLoss === 'function') renderer.forceContextLoss();
      if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    announceMapState('disposed');
  };

  const updateMarker = marker => {
    const selected = markerGroup.getObjectByName(marker.id);
    if (!selected) {
      addMarker(marker);
      return;
    }
    const nextPosition = worldToScene(marker);
    if (selected.userData && selected.userData.model3d) {
      selected.userData.targetScenePosition = nextPosition;
    } else {
      selected.position.copy(nextPosition);
    }
    selected.userData = Object.assign({}, selected.userData, marker);
    if (marker.id === 'player-self') updateRouteToSelection();
  };

  const focusToWorld = ({ x = 0, y = 0, z = 3 }) => {
    if (!camera || !controls) return;
    const zoom = Math.max(1, Math.min(6, Number(z) || 3));
    const target = worldToScene({ x, y, z: 0 });
    const distance = 8800 - zoom * 980;
    controls.target.copy(target);
    camera.position.set(target.x - distance * .75, target.y + distance * .62, target.z + distance * .42);
    camera.lookAt(target);
    controls.update();
  };

  const resetView = () => {
    if (!camera || !controls) return;
    camera.position.set(defaultCamera.x, defaultCamera.y, defaultCamera.z);
    controls.target.set(0, 0, 0);
    controls.update();
  };

  const zoomView = direction => {
    if (!camera || !controls) return;
    const offset = camera.position.clone().sub(controls.target);
    const factor = direction > 0 ? .78 : 1.28;
    const nextDistance = Math.max(controls.minDistance, Math.min(controls.maxDistance, offset.length() * factor));
    offset.setLength(nextDistance);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  };

  const bindMapInterface = () => {
    const radiusInput = document.getElementById('policeRadius');
    const radiusOutput = document.getElementById('policeRadiusValue');
    const updateCoordinates = point => {
      ['X', 'Y', 'Z'].forEach(axis => {
        const node = document.getElementById(`map${axis}`);
        const value = point && point[axis.toLowerCase()];
        if (node && Number.isFinite(value)) node.textContent = Math.round(value);
      });
    };

    document.querySelectorAll('.map-preset').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.map-preset').forEach(item => item.classList.remove('is-active'));
        button.classList.add('is-active');
        const point = { x: Number(button.dataset.x), y: Number(button.dataset.y), z: Number(button.dataset.z) };
        focusToWorld(point);
        updateCoordinates(point);
      });
    });
    document.getElementById('mapZoomIn')?.addEventListener('click', () => zoomView(1));
    document.getElementById('mapZoomOut')?.addEventListener('click', () => zoomView(-1));
    document.getElementById('mapReset')?.addEventListener('click', () => {
      resetView();
      updateCoordinates({ x: 0, y: 0, z: 0 });
      document.querySelectorAll('.map-preset').forEach((item, index) => item.classList.toggle('is-active', index === 0));
    });
    radiusInput?.addEventListener('input', () => {
      const radius = Number(radiusInput.value);
      if (radiusOutput) radiusOutput.textContent = `${radius} m`;
      setPoliceZoneRadius(radius);
    });
    document.getElementById('mapPoliceZone')?.addEventListener('click', () => {
      const point = hoveredPoint || selectedPoint || { x: 447, y: -991, z: 78 };
      setSelectedPoint(point, { radius: Number(radiusInput?.value || policeZoneRadius) });
      updateCoordinates(point);
      setStatus('Lezárási zóna kijelölve');
    });
    document.getElementById('mapFullscreen')?.addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
      } catch (_) {
        setStatus('A teljes képernyős mód nem érhető el');
      }
    });
    window.addEventListener('alpar3d:hover', event => updateCoordinates(event.detail));
    window.addEventListener('alpar3d:waypoint', event => updateCoordinates(event.detail));
    const fxCursor = document.getElementById('fxCursor');
    if (fxCursor && window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let cursorFrame = 0;
      document.addEventListener('pointermove', event => {
        document.documentElement.style.setProperty('--pointer-x', `${event.clientX}px`);
        document.documentElement.style.setProperty('--pointer-y', `${event.clientY}px`);
        if (cursorFrame) return;
        cursorFrame = requestAnimationFrame(() => {
          cursorFrame = 0;
          fxCursor.style.transform = `translate3d(${event.clientX}px,${event.clientY}px,0)`;
        });
      }, { passive: true });
      document.addEventListener('pointerover', event => fxCursor.classList.toggle('is-active', Boolean(event.target.closest('button,a,input'))));
    }
  };

  const resize = () => {
    if (!renderer || !camera) return;
    renderer.setPixelRatio(getPowerProfile().pixelRatio);
    const rect = stage.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(320, rect.height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const runHoverPointUpdate = event => {
    hoverFrame = 0;
    if (!mapObject || !raycastTargets.length || disposed) return;
    const rect = stage.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(raycastTargets, true);
    if (!intersects.length) return;
    hoveredPoint = sceneToWorld(intersects[0].point);
    window.Alpar3DMap.hoveredWorld = hoveredPoint;
    window.dispatchEvent(new CustomEvent('alpar3d:hover', { detail: hoveredPoint }));
  };

  const updateHoverPoint = event => {
    pendingHoverEvent = event;
    if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => runHoverPointUpdate(pendingHoverEvent));
  };

  function handleWaypoint() {
    if (!hoveredPoint) return;
    window.dispatchEvent(new CustomEvent('alpar3d:waypoint', { detail: hoveredPoint }));
    setSelectedPoint(hoveredPoint);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stopRenderLoop();
      return;
    }
    startRenderLoop();
    resize();
  }

  const renderFrame = timestamp => {
    if (disposed || !renderer || !scene || !camera) return;
    const profile = getPowerProfile();
    const frameInterval = 1000 / profile.targetFps;
    if (document.hidden) {
      isAnimating = false;
      animationId = 0;
      return;
    }
    animationId = requestAnimationFrame(renderFrame);
    if (timestamp - lastRenderTime < frameInterval) return;
    lastRenderTime = timestamp;
    if (controls) controls.update();
    if (markerGroup) {
      markerGroup.children.forEach(marker => {
        if (marker.userData && marker.userData.targetScenePosition) {
          marker.position.lerp(marker.userData.targetScenePosition, .12);
        }
        const distance = camera.position.distanceTo(marker.position);
        if (marker.userData && marker.userData.model3d) {
          const scale = Math.max(.9, Math.min(2.8, distance / 4200));
          marker.scale.set(scale, scale, scale);
        } else {
          const scale = Math.max(140, Math.min(430, distance / 18));
          marker.scale.set(scale * 2.9, scale, 1);
        }
      });
    }
    if (zoneGroup) {
      const pulse = timestamp * .002;
      zoneGroup.children.forEach(zone => {
        if (zone.material) zone.material.opacity = Math.max(.34, Math.min(.9, (zone.userData.opacity || .7) + Math.sin(pulse + zone.userData.pulse) * .12));
      });
    }
    renderer.render(scene, camera);
  };

  const startRenderLoop = () => {
    if (isAnimating || disposed) return;
    isAnimating = true;
    lastRenderTime = 0;
    animationId = requestAnimationFrame(renderFrame);
  };

  const stopRenderLoop = () => {
    isAnimating = false;
    if (animationId) cancelAnimationFrame(animationId);
    animationId = 0;
  };

  const init = () => {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070910, 0.000045);

    const rect = stage.getBoundingClientRect();
    camera = new THREE.PerspectiveCamera(42, Math.max(1, rect.width) / Math.max(1, rect.height), 1, 65000);
    camera.position.set(defaultCamera.x, defaultCamera.y, defaultCamera.z);

    const profile = getPowerProfile();
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(profile.pixelRatio);
    renderer.setClearColor(0x070910, 0);
    stage.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = .08;
    controls.enableZoom = true;
    controls.minDistance = 900;
    controls.maxDistance = 18000;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, .82));

    const keyLight = new THREE.DirectionalLight(0xffd8a0, 1.7);
    keyLight.position.set(-600, 1400, 900);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x6feaff, 1.1);
    fillLight.position.set(1200, 900, -600);
    scene.add(fillLight);

    markerGroup = new THREE.Group();
    markerGroup.name = 'Alpar3DMarkers';
    scene.add(markerGroup);

    zoneGroup = new THREE.Group();
    zoneGroup.name = 'Alpar3DZones';
    scene.add(zoneGroup);

    routeGroup = new THREE.Group();
    routeGroup.name = 'Alpar3DRouteLayer';
    scene.add(routeGroup);

    const activateMap = (mode = 'lightweight') => {
      setMarkers(demoMarkers);
      startDemoSimulation();
      resetView();
      setProgress(100);
      setStatus(mode === 'full' ? 'RĂ©szletes 3D tĂ©rkĂ©p aktĂ­v' : 'OptimalizĂˇlt 3D tĂ©rkĂ©p aktĂ­v');
      if (loaderPanel) loaderPanel.classList.add('is-done');
      announceMapState('ready', { mode, markers: markerGroup ? markerGroup.children.length : 0 });
    };

    const parameters = new URLSearchParams(window.location.search);
    const shouldLoadFullModel = parameters.get('detail') !== 'light';

    if (!shouldLoadFullModel) {
      createLightweightTerrain();
      activateMap('lightweight');
    } else {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (url, loaded, total) => {
      if (total) setProgress((loaded / total) * 100);
      setStatus(`Asset: ${url.split('/').pop()}`);
    };
    manager.onLoad = () => {
      setProgress(100);
      setStatus('3D térkép aktív');
      if (loaderPanel) loaderPanel.classList.add('is-done');
      announceMapState('ready', { markers: markerGroup ? markerGroup.children.length : 0 });
    };
    manager.onError = url => {
      setStatus(`Betoltesi hiba: ${url.split('/').pop()}`);
      if (loaderPanel) loaderPanel.classList.add('is-error');
      announceMapState('error', { url });
    };

    const mtlLoader = new THREE.MTLLoader(manager);
    mtlLoader.setBaseUrl(ASSET_ROOT);
    mtlLoader.setPath(ASSET_ROOT);
    mtlLoader.load('model.mtl', materials => {
      materials.preload();
      Object.keys(materials.materials).forEach(key => {
        const material = materials.materials[key];
        if (material.map) {
          material.map.minFilter = THREE.LinearFilter;
          material.map.magFilter = THREE.LinearFilter;
          let maxAnisotropy = 1;
          if (renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === 'function') {
            maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
          } else if (typeof renderer.getMaxAnisotropy === 'function') {
            maxAnisotropy = renderer.getMaxAnisotropy();
          }
          material.map.anisotropy = Math.min(8, maxAnisotropy || 1);
        }
      });

      const objLoader = new THREE.OBJLoader(manager);
      objLoader.setMaterials(materials);
      objLoader.setPath(ASSET_ROOT);
      objLoader.load('model.obj', object => {
        mapObject = object;
        mapObject.name = 'GTAV3DMapModel';
        mapObject.traverse(child => {
          if (child instanceof THREE.Mesh) {
            child.frustumCulled = true;
            raycastTargets.push(child);
          }
        });
        scene.add(mapObject);
        setMarkers(demoMarkers);
        startDemoSimulation();
        resetView();
      });
    });
    }

    stage.addEventListener('pointermove', updateHoverPoint, { passive: true });
    stage.addEventListener('dblclick', handleWaypoint);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', destroy, { once: true });
    window.addEventListener('beforeunload', destroy, { once: true });
    resize();
    startRenderLoop();
  };

  window.Alpar3DMap = {
    addMarker,
    removeMarker,
    updateMarker,
    clearMarkers,
    setMarkers,
    setZones,
    clearZones,
    setSelectedPoint,
    clearRoute: clearRouteLayer,
    setPoliceZoneRadius,
    getRoadRoute: (from, to) => findRoadPath(from, to),
    setEntities: ({ players = [], items = [], marks = [], zones = [] } = {}) => {
      const normalized = [
        ...players.map(player => Object.assign({ type: 'player', color: '#4fe8ff' }, player)),
        ...items.map(item => Object.assign({ type: 'item', color: '#ff3154' }, item)),
        ...marks.map(mark => Object.assign({ type: 'mark', color: '#f5c76b' }, mark))
      ];
      setMarkers(normalized);
      setZones(zones);
    },
    randomizeDemo: () => {
      const demo = createDemoEntities();
      setMarkers([].concat(demo.players, demo.items, demo.marks));
      setZones(demo.zones);
    },
    stopDemo: stopDemoSimulation,
    focusToWorld,
    resetView,
    destroy,
    getStats: () => ({
      memory: renderer && renderer.info ? renderer.info.memory : null,
      render: renderer && renderer.info ? renderer.info.render : null,
      markers: markerGroup ? markerGroup.children.length : 0,
      zones: zoneGroup ? zoneGroup.children.length : 0,
      routeObjects: routeGroup ? routeGroup.children.length : 0,
      selectedPoint,
      policeZoneRadius,
      raycastTargets: raycastTargets.length,
      disposed,
      hidden: document.hidden,
      powerProfile: getPowerProfile()
    }),
    worldToScene,
    sceneToWorld,
    get hoveredWorld() {
      return hoveredPoint;
    }
  };

  init();
  bindMapInterface();
})();
