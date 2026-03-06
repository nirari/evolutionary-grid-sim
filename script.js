// Constants
const GRID_SIZE = 60; // Increased grid size
const CELL_SIZE = 15; // in pixels
const WATER_CHANNEL_SIZE = 2; // Width of water channels
const INITIAL_TREES = 50;
const MAX_TREE_AGE = 100;
const MAX_TREE_HEIGHT = 10; // Max height in arbitrary units
const INITIAL_HEALTH = 100;
const MAX_HEALTH = 100;
const WATER_REGEN_RATE = 0.05; // % of max water regenerated per empty cell
const NUTRIENT_REGEN_RATE = 0.05; // % of max nutrients regenerated per empty cell
const MAX_CELL_RESOURCE = 100; // Max water/nutrients a cell can hold
const MUTATION_RATE = 0.1; // Probability of a gene mutating
const MUTATION_MAGNITUDE = 0.2; // How much a gene can change by (0-1 range)
let GENERATION_TIME = 200; // milliseconds per generation (now a let for speed slider)

// Island Constants
const NUM_ISLANDS_PER_SIDE = 2; // For a 2x2 grid of islands
const ISLAND_SIZE_LAND = (GRID_SIZE - (WATER_CHANNEL_SIZE * (NUM_ISLANDS_PER_SIDE - 1))) / NUM_ISLANDS_PER_SIDE; // Actual land size of each island
let MIGRATION_PERCENTAGE; // Will be set by slider

// Genome indices for clarity
const GENE_GROWTH_RATE = 0;
const GENE_WATER_EFFICIENCY = 1;
const GENE_NUTRIENT_EFFICIENCY = 2;
const GENE_SEED_ABUNDANCE = 3;
const GENE_SHADE_TOLERANCE = 4;
const GENOME_SIZE = 5; // Number of genes in the genome

// DOM Elements
const gridContainer = document.getElementById('grid-container');
const startButton = document.getElementById('startButton');
const pauseButton = document.getElementById('pauseButton');
const resetButton = document.getElementById('resetButton');
const generationCountSpan = document.getElementById('generationCount');
const populationCountSpan = document.getElementById('populationCount');
const migrationRateSlider = document.getElementById('migrationRateSlider');
const migrationRateValueSpan = document.getElementById('migrationRateValue');
const migrationIntervalSlider = document.getElementById('migrationIntervalSlider');
const migrationIntervalValueSpan = document.getElementById('migrationIntervalValue');
const speedSlider = document.getElementById('speedSlider');
const speedValueSpan = document.getElementById('speedValue');
const autostopCheckbox = document.getElementById('autostopCheckbox');
const stopConditionDropdown = document.getElementById('stopConditionDropdown');
const migrationStartGenDropdown = document.getElementById('migrationStartGenDropdown');
const replacementStrategyDropdown = document.getElementById('replacementStrategyDropdown');

// Info Panel Elements
const infoPanel = document.getElementById('info-panel');
const islandHealthList = document.getElementById('island-health-list');

const infoX = document.getElementById('info-x');
const infoY = document.getElementById('info-y');
const infoAge = document.getElementById('info-age');
const infoHeight = document.getElementById('info-height');
const infoHealth = document.getElementById('info-health');
const infoWater = document.getElementById('info-water');
const infoNutrients = document.getElementById('info-nutrients');
const infoGenome = document.getElementById('info-genome');

// Color Legend Elements
// (Removed individual counters as we now use a spectrum)

// Simulation State
// ... (rest of simulation state)
let grid = []; // Stores Tree objects or 'water'
let cellResources = []; // Stores {water, nutrients} for each cell
let cellElements = []; // Cache for grid cell DOM elements
let trees = [];
let generation = 0;
let isRunning = false;
let simulationInterval;
let nextTreeId = 0;
let MIGRATION_INTERVAL = 50; 
let REPLACEMENT_STRATEGY = 'leastFitted'; // Default strategy
let MIGRATION_START_GENERATION = 100; // Default migration start generation

const FLASH_DURATION = 400; // milliseconds
const flashingCells = new Map(); // Stores {key: "x,y", value: {type, timeoutId}}

// --- Helper Functions ---
function updateIslandStats() {
    if (!islandHealthList) return [];

    const numIslands = NUM_ISLANDS_PER_SIDE * NUM_ISLANDS_PER_SIDE;
    const islandData = Array.from({ length: numIslands }, () => ({ totalHealth: 0, totalFitness: 0, count: 0 }));

    if (trees && trees.length > 0) {
        trees.forEach(tree => {
            if (tree.isAlive) {
                const islandIndex = getIslandIndex(tree.x, tree.y);
                if (islandIndex !== null && islandIndex >= 0 && islandIndex < numIslands) {
                    tree.calculateFitness(); // Ensure fitness is up to date
                    islandData[islandIndex].totalHealth += tree.health;
                    islandData[islandIndex].totalFitness += tree.fitness;
                    islandData[islandIndex].count++;
                }
            }
        });
    }

    const fragment = document.createDocumentFragment();
    islandData.forEach((data, index) => {
        const avgHealth = data.count > 0 ? (data.totalHealth / data.count).toFixed(1) : "0.0";
        const avgFitness = data.count > 0 ? (data.totalFitness / data.count).toFixed(1) : "0.0";
        const div = document.createElement('div');
        div.className = 'island-stat-item';
        div.innerHTML = `Island ${index + 1}: <span>H:${avgHealth}%</span> <b>F:${avgFitness}</b> (${data.count})`;
        fragment.appendChild(div);
    });

    islandHealthList.innerHTML = '';
    islandHealthList.appendChild(fragment);

    return islandData;
}

function checkAutoStop(islandData) {
    if (!autostopCheckbox || !autostopCheckbox.checked) return;

    const condition = stopConditionDropdown.value;
    let shouldStop = false;

    switch (condition) {
        case 'allFitness100':
            shouldStop = islandData.length > 0 && islandData.every(d => d.count > 0 && (d.totalFitness / d.count) >= 100);
            break;
        case 'generation500':
            shouldStop = generation >= 500;
            break;
        case 'generation1000':
            shouldStop = generation >= 1000;
            break;
    }

    if (shouldStop) {
        console.log(`Auto-stop condition met: ${condition}`);
        pauseSimulation();
    }
}

// Helper to get island index from coordinates (0, 1, 2, 3 for 2x2 grid)
// Returns null if coordinate is in a water channel.
function getIslandIndex(x, y) {
    const horizontalWaterStart = (GRID_SIZE / 2) - (WATER_CHANNEL_SIZE / 2);
    const horizontalWaterEnd = (GRID_SIZE / 2) + (WATER_CHANNEL_SIZE / 2) - 1;
    const verticalWaterStart = (GRID_SIZE / 2) - (WATER_CHANNEL_SIZE / 2);
    const verticalWaterEnd = (GRID_SIZE / 2) + (WATER_CHANNEL_SIZE / 2) - 1;

    if ((x >= horizontalWaterStart && x <= horizontalWaterEnd) ||
        (y >= verticalWaterStart && y <= verticalWaterEnd)) {
        return null; // In water channel
    }

    let adjustedX = x;
    let adjustedY = y;

    if (x > horizontalWaterEnd) {
        adjustedX -= WATER_CHANNEL_SIZE;
    }
    if (y > verticalWaterEnd) {
        adjustedY -= WATER_CHANNEL_SIZE;
    }

    const islandX = Math.floor(adjustedX / ISLAND_SIZE_LAND);
    const islandY = Math.floor(adjustedY / ISLAND_SIZE_LAND);
    return islandY * NUM_ISLANDS_PER_SIDE + islandX;
}

// --- Tree Class ---
class Tree {
    constructor(id, x, y, genome, age = 0, height = 1, health = INITIAL_HEALTH, storedWater = 0, storedNutrients = 0) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.genome = genome; // Array of normalized gene values (0 to 1)
        this.age = age;
        this.height = height;
        this.health = health;
        this.storedWater = storedWater;
        this.storedNutrients = storedNutrients;
        this.isAlive = true;
        this.fitness = 0; // Initialize fitness
    }

    calculateFitness() {
        // Fitness based on a combination of age, health, and reproductive potential
        // Age: Older trees have proven survival
        // Health: Healthy trees are successful at resource management
        // Seed Abundance: Directly reflects reproductive potential
        this.fitness = (this.age * 0.1) + (this.health * 0.5) + (this.seedAbundance * 100); // Scaled for impact
        this.fitness = Math.max(0.1, this.fitness); // Ensure fitness is never too low to be selected
    }

    // Getters for genome-derived traits (scaled from 0-1 gene value)
    get growthRate() { return 0.05 + this.genome[GENE_GROWTH_RATE] * 0.1; } // 0.05 to 0.15
    get waterEfficiency() { return 0.5 + this.genome[GENE_WATER_EFFICIENCY] * 0.5; } // 0.5 to 1.0
    get nutrientEfficiency() { return 0.5 + this.genome[GENE_NUTRIENT_EFFICIENCY] * 0.5; } // 0.5 to 1.0
    get seedAbundance() { return 0.1 + this.genome[GENE_SEED_ABUNDANCE] * 0.4; } // 0.1 to 0.5 (probability)
    get shadeTolerance() { return this.genome[GENE_SHADE_TOLERANCE]; } // 0 to 1

    // Resource needs scale with height/size
    get waterNeed() { return this.height * 2; }
    get nutrientNeed() { return this.height * 1.5; }

    // Consume resources from its cell
    consumeResources() {
        const cell = cellResources[this.x][this.y];

        // Try to consume water
        let waterToConsume = Math.min(this.waterNeed, cell.water * this.waterEfficiency);
        this.storedWater += waterToConsume;
        cell.water -= waterToConsume;

        // Try to consume nutrients
        let nutrientsToConsume = Math.min(this.nutrientNeed, cell.nutrients * this.nutrientEfficiency);
        this.storedNutrients += nutrientsToConsume;
        cell.nutrients -= nutrientsToConsume;

        // Update health based on resource sufficiency
        const waterSufficiency = this.storedWater / this.waterNeed;
        const nutrientSufficiency = this.storedNutrients / this.nutrientNeed;
        const overallSufficiency = (waterSufficiency + nutrientSufficiency) / 2;

        if (overallSufficiency < 0.8) { // If not enough resources
            this.health -= (0.8 - overallSufficiency) * 20; // Lose health faster if very insufficient
        } else if (overallSufficiency > 1.2) { // If abundant resources, regain health slowly
            this.health += (overallSufficiency - 1) * 5;
        }

        this.health = Math.max(0, Math.min(MAX_HEALTH, this.health));
        this.storedWater = Math.max(0, this.storedWater - this.waterNeed); // Use up stored resources
        this.storedNutrients = Math.max(0, this.storedNutrients - this.nutrientNeed);
    }

    // Grow based on health and growth rate
    grow() {
        if (this.health > MAX_HEALTH * 0.75) { // Only grow if healthy
            this.height += this.growthRate;
            this.height = Math.min(MAX_TREE_HEIGHT, this.height);
        }
    }

    // Attempt to reproduce
    reproduce() {
        if (this.age > MAX_TREE_AGE / 5 && Math.random() < this.seedAbundance) { // Only mature trees reproduce
            const possibleSpots = [];
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;

                    const nx = this.x + dx;
                    const ny = this.y + dy;

                    // Ensure potential spot is within grid and is empty land
                    if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && grid[nx][ny] === null) {
                        possibleSpots.push({ x: nx, y: ny });
                    }
                }
            }

            if (possibleSpots.length > 0) {
                const spot = possibleSpots[Math.floor(Math.random() * possibleSpots.length)];
                // Create new genome with mutation
                const newGenome = this.genome.map(gene => {
                    if (Math.random() < MUTATION_RATE) {
                        return Math.max(0, Math.min(1, gene + (Math.random() - 0.5) * MUTATION_MAGNITUDE));
                    }
                    return gene;
                });
                return new Tree(nextTreeId++, spot.x, spot.y, newGenome, 0, 1, INITIAL_HEALTH);
            }
        }
        return null;
    }

    // Check if the tree should die
    checkMortality() {
        if (this.health <= 0 || this.age >= MAX_TREE_AGE) {
            this.isAlive = false;
            return true;
        }
        return false;
    }

    getDisplayColor() {
        this.calculateFitness(); // Ensure it's up to date for coloring

        let hue;
        const fitness = Math.min(120, this.fitness);

        if (fitness <= 90) {
            // Map 0-90 fitness to 0-35 hue (Red to Orange)
            // Shifting 90 to hue 35 keeps it in the red/orange zone longer
            hue = (fitness / 90) * 35;
        } else {
            // Map 90-120 fitness to 35-120 hue (Orange to Green)
            hue = 35 + ((fitness - 90) / (120 - 90)) * 85;
        }

        const saturation = 80;
        const lightness = 40 + Math.round(this.height / MAX_TREE_HEIGHT * 20);
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
}

function createGrid() {
    gridContainer.style.gridTemplateColumns = `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`;
    gridContainer.style.gridTemplateRows = `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`;
    gridContainer.innerHTML = ''; // Clear previous grid
    cellElements = []; // Reset element cache

    // Define water channel coordinates (center rows/columns)
    const horizontalWaterStart = (GRID_SIZE / 2) - (WATER_CHANNEL_SIZE / 2);
    const horizontalWaterEnd = (GRID_SIZE / 2) + (WATER_CHANNEL_SIZE / 2) - 1;
    const verticalWaterStart = (GRID_SIZE / 2) - (WATER_CHANNEL_SIZE / 2);
    const verticalWaterEnd = (GRID_SIZE / 2) + (WATER_CHANNEL_SIZE / 2) - 1;

    for (let i = 0; i < GRID_SIZE; i++) {
        grid[i] = [];
        cellResources[i] = [];
        cellElements[i] = [];
        for (let j = 0; j < GRID_SIZE; j++) {
            const cellDiv = document.createElement('div');
            cellDiv.classList.add('grid-cell');
            cellDiv.dataset.x = i;
            cellDiv.dataset.y = j;
            cellElements[i][j] = cellDiv; // Cache the element

            const isWaterCell =
                (i >= horizontalWaterStart && i <= horizontalWaterEnd) ||
                (j >= verticalWaterStart && j <= verticalWaterEnd);

            if (isWaterCell) {
                cellDiv.classList.add('water-cell');
                grid[i][j] = 'water'; // Mark as water, no tree can be here
                cellResources[i][j] = { water: MAX_CELL_RESOURCE * 2, nutrients: MAX_CELL_RESOURCE * 0.1 }; // High water, low nutrients
            } else {
                grid[i][j] = null; // Initialize grid cells as empty land
                cellResources[i][j] = { water: MAX_CELL_RESOURCE * 0.8, nutrients: MAX_CELL_RESOURCE * 0.8 }; // Initial land resources
            }
            cellDiv.addEventListener('mouseenter', () => showTreeInfo(i, j));            cellDiv.addEventListener('mouseleave', hideTreeInfo);
            gridContainer.appendChild(cellDiv);
        }
    }
}

function renderGrid() {
    // 1. Update text-based UI elements first for better responsiveness
    if (populationCountSpan) populationCountSpan.textContent = trees.length;
    if (generationCountSpan) generationCountSpan.textContent = generation;
    const islandData = updateIslandStats();

    // 2. Update grid cells using the cached elements
    for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
            const cellDiv = cellElements[i][j];
            if (!cellDiv) continue;

            const tree = grid[i][j];

            // Clear any existing flash classes
            cellDiv.classList.remove('flash-source', 'flash-destination');

            // If this cell is currently flashing, add the class and set a timeout to remove it
            const cellKey = `${i},${j}`;
            if (flashingCells.has(cellKey)) {
                const flashData = flashingCells.get(cellKey);
                const flashClass = `flash-${flashData.type}`;
                cellDiv.classList.add(flashClass);

                // Clear previous timeout if exists and set new one
                if (flashData.timeoutId) {
                    clearTimeout(flashData.timeoutId);
                }

                const timeoutId = setTimeout(() => {
                    cellDiv.classList.remove(flashClass);
                    flashingCells.delete(cellKey);
                }, FLASH_DURATION);
                flashData.timeoutId = timeoutId;
            }

            if (tree && tree !== 'water') { // Check if it's a tree object, not just 'water'
                // If a tree is present, color the cell based on the tree's properties
                cellDiv.style.backgroundColor = tree.getDisplayColor();
                cellDiv.style.opacity = tree.health / MAX_HEALTH; // Health affects opacity
                cellDiv.classList.remove('water-cell'); // Ensure water-cell class is removed if tree spawns on it
            } else if (grid[i][j] === 'water') { // Explicitly handle water cells
                cellDiv.style.backgroundColor = ''; // Clear previous color (will be set by CSS)
                cellDiv.classList.add('water-cell'); // Ensure water-cell class is present
                cellDiv.style.opacity = 1;
            }
            else {
                // If no tree and not water, color based on resources (land)
                cellDiv.style.backgroundColor = `hsl(120, ${50 + Math.round(cellResources[i][j].nutrients / MAX_CELL_RESOURCE * 20)}%, ${85 - Math.round(cellResources[i][j].water / MAX_CELL_RESOURCE * 15)}%)`;
                cellDiv.classList.remove('water-cell'); // Ensure water-cell class is removed
                cellDiv.style.opacity = 1; // Full opacity for empty cells
            }
        }
    }
    return islandData;
}

function showTreeInfo(x, y) {
    const tree = grid[x][y];
    if (tree && tree !== 'water') {
        infoX.textContent = tree.x;
        infoY.textContent = tree.y;
        infoAge.textContent = tree.age;
        infoHeight.textContent = tree.height.toFixed(2);
        infoHealth.textContent = tree.health.toFixed(1);
        infoWater.textContent = tree.storedWater.toFixed(1);
        infoNutrients.textContent = tree.storedNutrients.toFixed(1);
        infoGenome.textContent = tree.genome.map(g => g.toFixed(2)).join(', ');
        infoPanel.style.opacity = 1;
    } else if (tree === 'water') {
        infoX.textContent = x;
        infoY.textContent = y;
        infoAge.textContent = 'N/A (Water)';
        infoHeight.textContent = 'N/A';
        infoHealth.textContent = 'N/A';
        infoWater.textContent = cellResources[x][y].water.toFixed(1);
        infoNutrients.textContent = cellResources[x][y].nutrients.toFixed(1);
        infoGenome.textContent = 'N/A';
        infoPanel.style.opacity = 1;
    } else {
        hideTreeInfo();
    }
}

function hideTreeInfo() {
    infoPanel.style.opacity = 0; // Hide panel if no tree or mouse leaves
}

// --- Simulation Logic ---
function initSimulation() {
    generation = 0;
    trees = [];
    nextTreeId = 0;
    grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)); // Reset grid state
    cellResources = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)); // Reset resources

    createGrid(); // This also initializes cellResources and grid 'water' cells

    // Initialize MIGRATION_PERCENTAGE from slider
    MIGRATION_PERCENTAGE = parseFloat(migrationRateSlider.value) / 100;
    migrationRateValueSpan.textContent = `${migrationRateSlider.value}%`;

    // Initialize MIGRATION_INTERVAL from slider (now controls frequency)
    MIGRATION_INTERVAL = parseInt(migrationIntervalSlider.value);
    migrationIntervalValueSpan.textContent = `${MIGRATION_INTERVAL} gen`;

    // Initialize MIGRATION_START_GENERATION from dropdown
    MIGRATION_START_GENERATION = parseInt(migrationStartGenDropdown.value);

    // Initialize REPLACEMENT_STRATEGY from dropdown
    REPLACEMENT_STRATEGY = replacementStrategyDropdown.value;

    // Initialize GENERATION_TIME from speed slider
    setSimulationSpeed(speedSlider.value);

    // Create initial trees, distributing them randomly across islands
    for (let i = 0; i < INITIAL_TREES; i++) {
        let randomIslandIndex;
        let attempts = 0;
        const MAX_ISLAND_ATTEMPTS = 100; // Prevent infinite loop if islands are full

        do {
            randomIslandIndex = Math.floor(Math.random() * (NUM_ISLANDS_PER_SIDE * NUM_ISLANDS_PER_SIDE));
            attempts++;
            if (attempts > MAX_ISLAND_ATTEMPTS) {
                console.warn("Could not find an empty spot on any island for initial tree placement.");
                break;
            }
        } while (addRandomTree(randomIslandIndex) === null); // Keep trying until a tree is placed or attempts exhausted
    }

    renderGrid();
    updateControls();
}

// targetIslandIndex: if provided, tree is added within that island.
// initialGenome: if provided, the tree is created with this genome instead of a random one.
// isMigrant: boolean to indicate if this tree is a result of migration (for flash effect)
function addRandomTree(targetIslandIndex = null, initialGenome = null, isMigrant = false) {
    let x, y;
    let attempts = 0;
    const MAX_ATTEMPTS = GRID_SIZE * GRID_SIZE;

    let startX, endX, startY, endY;

    // Define water channel coordinates (re-using from createGrid for consistency)
    const horizontalWaterStart = (GRID_SIZE / 2) - (WATER_CHANNEL_SIZE / 2);
    const horizontalWaterEnd = (GRID_SIZE / 2) + (WATER_CHANNEL_SIZE / 2) - 1;
    const verticalWaterStart = (GRID_SIZE / 2) - (WATER_CHANNEL_SIZE / 2);
    const verticalWaterEnd = (GRID_SIZE / 2) + (WATER_CHANNEL_SIZE / 2) - 1;

    if (targetIslandIndex !== null) {
        const islandRow = Math.floor(targetIslandIndex / NUM_ISLANDS_PER_SIDE);
        const islandCol = targetIslandIndex % NUM_ISLANDS_PER_SIDE;

        // Calculate land boundaries for the specific island, accounting for water channels
        startX = islandCol * ISLAND_SIZE_LAND;
        endX = startX + ISLAND_SIZE_LAND - 1;
        startY = islandRow * ISLAND_SIZE_LAND;
        endY = startY + ISLAND_SIZE_LAND - 1;

        // Adjust for water channels if the island is in the second row/column
        if (islandCol === 1) { // Right islands
            startX += WATER_CHANNEL_SIZE;
            endX += WATER_CHANNEL_SIZE;
        }
        if (islandRow === 1) { // Bottom islands
            startY += WATER_CHANNEL_SIZE;
            endY += WATER_CHANNEL_SIZE;
        }

    } else {
        // Place anywhere on the grid (excluding water) if no target island specified
        startX = 0; endX = GRID_SIZE - 1;
        startY = 0; endY = GRID_SIZE - 1;
    }

    do {
        x = startX + Math.floor(Math.random() * (endX - startX + 1));
        y = startY + Math.floor(Math.random() * (endY - startY + 1));
        attempts++;
        if (attempts > MAX_ATTEMPTS) {
            // console.warn(`Grid or island ${targetIslandIndex} is full, cannot add more trees.`);
            return null; // Cannot add tree if grid/island is full
        }
    } while (grid[x][y] !== null); // Only place on empty land cells (null, not 'water')


    const genome = initialGenome || Array.from({ length: GENOME_SIZE }, () => Math.random());
    const newTree = new Tree(nextTreeId++, x, y, genome);
    trees.push(newTree);
    grid[x][y] = newTree;

    if (isMigrant) {
        flashingCells.set(`${x},${y}`, { type: 'destination', timeoutId: null });
    }

    return newTree;
}


// --- Migration Logic ---
function handleMigration() {
    console.log(`Generation ${generation}: Initiating bird migration (transferring seeds).`);
    const numIslands = NUM_ISLANDS_PER_SIDE * NUM_ISLANDS_PER_SIDE;
    const clockwiseMap = { 0: 1, 1: 3, 3: 2, 2: 0 };
    const treesByIsland = Array.from({ length: numIslands }, () => []);

    // 1. Group trees by island and sort by fitness (best first)
    trees.forEach(tree => {
        if (tree.isAlive) {
            const idx = getIslandIndex(tree.x, tree.y);
            if (idx !== null) treesByIsland[idx].push(tree);
        }
    });

    treesByIsland.forEach(islandTrees => {
        islandTrees.forEach(t => t.calculateFitness());
        islandTrees.sort((a, b) => b.fitness - a.fitness);
    });

    const newMigrants = [];

    // 2. Process migration for each island
    for (let srcIdx = 0; srcIdx < numIslands; srcIdx++) {
        const srcTrees = treesByIsland[srcIdx];
        if (srcTrees.length === 0) continue;

        const targetIdx = clockwiseMap[srcIdx];
        const targetTrees = treesByIsland[targetIdx];

        // Top X% from source island
        const numMigrants = Math.ceil(srcTrees.length * MIGRATION_PERCENTAGE);
        const topTrees = srcTrees.slice(0, numMigrants);

        // Flash source trees
        topTrees.forEach(t => {
            flashingCells.set(`${t.x},${t.y}`, { type: 'source', timeoutId: null });
        });

        // Bottom X% from target island to be replaced
        const numToReplace = Math.ceil(targetTrees.length * MIGRATION_PERCENTAGE);

        if (targetTrees.length > 0 && numToReplace > 0) {
            let victims;
            if (REPLACEMENT_STRATEGY === 'random') {
                // Shuffle target trees and pick victims randomly
                const shuffledTargetTrees = [...targetTrees].sort(() => 0.5 - Math.random());
                victims = shuffledTargetTrees.slice(0, numToReplace);
            } else { // Default to leastFitted
                // Find the least fit trees on the target island
                targetTrees.forEach(t => t.calculateFitness());
                targetTrees.sort((a, b) => a.fitness - b.fitness); // Sort by fitness (lowest first)
                victims = targetTrees.slice(0, numToReplace);
            }

            victims.forEach((victim, i) => {
                victim.isAlive = false;
                grid[victim.x][victim.y] = null;

                // Parent is chosen from source top trees (cycling if counts don't match)
                const parent = topTrees[i % topTrees.length];

                const newGenome = parent.genome.map(gene => {
                    if (Math.random() < MUTATION_RATE) {
                        return Math.max(0, Math.min(1, gene + (Math.random() - 0.5) * MUTATION_MAGNITUDE));
                    }
                    return gene;
                });

                const newTree = new Tree(nextTreeId++, victim.x, victim.y, newGenome);
                newMigrants.push(newTree);
                grid[newTree.x][newTree.y] = newTree;
                flashingCells.set(`${newTree.x},${newTree.y}`, { type: 'destination', timeoutId: null });
            });
        } else if (targetTrees.length === 0) {
            // Target island is empty, colonize with offspring of all top trees
            topTrees.forEach(parent => {
                const newGenome = parent.genome.map(gene => {
                    if (Math.random() < MUTATION_RATE) {
                        return Math.max(0, Math.min(1, gene + (Math.random() - 0.5) * MUTATION_MAGNITUDE));
                    }
                    return gene;
                });
                addRandomTree(targetIdx, newGenome, true);
            });
        }
    }

    // 3. Cleanup dead trees and add new migrants
    trees = trees.filter(t => t.isAlive).concat(newMigrants);
}

function updateEcosystem() {
    generation++;

    if (isRunning) {
        // Handle migration every MIGRATION_INTERVAL generations, starting from MIGRATION_START_GENERATION
        if (generation >= MIGRATION_START_GENERATION && (generation - MIGRATION_START_GENERATION) % MIGRATION_INTERVAL === 0 && generation !== 0) {
            handleMigration();
        }

        // 1. Resource Regeneration
        for (let i = 0; i < GRID_SIZE; i++) {
            for (let j = 0; j < GRID_SIZE; j++) {
                cellResources[i][j].water = Math.min(MAX_CELL_RESOURCE, cellResources[i][j].water + MAX_CELL_RESOURCE * WATER_REGEN_RATE);
                cellResources[i][j].nutrients = Math.min(MAX_CELL_RESOURCE, cellResources[i][j].nutrients + MAX_CELL_RESOURCE * NUTRIENT_REGEN_RATE);
            }
        }

        const newTrees = [];
        const livingTrees = [];

        // Shuffle trees to prevent order bias in resource consumption/reproduction
        trees.sort(() => Math.random() - 0.5);

        // 2. Tree Actions (Consume, Grow, Reproduce)
        trees.forEach(tree => {
            if (!tree.isAlive) return; // Skip dead trees

            tree.age++;
            tree.consumeResources();
            tree.grow();

            const offspring = tree.reproduce();
            if (offspring) {
                // Check if the spot is still empty (another tree might have just grown there)
                if (grid[offspring.x][offspring.y] === null) {
                    newTrees.push(offspring);
                    grid[offspring.x][offspring.y] = offspring;
                } else {
                    // If spot taken, discard offspring or try to find another spot
                    // For simplicity, we discard for now
                }
            }

            if (tree.checkMortality()) {
                // Tree died, clear its spot in the grid
                grid[tree.x][tree.y] = null;
            } else {
                livingTrees.push(tree);
            }
        });

        // 3. Add new trees and filter out dead ones
        trees = livingTrees.concat(newTrees);
    }

    const islandData = renderGrid();
    checkAutoStop(islandData);
}
    // --- Simulation Controls ---
function startSimulation() {
    if (!isRunning) {
        isRunning = true;
        // Clear any existing interval before starting a new one
        if (simulationInterval) clearInterval(simulationInterval);
        simulationInterval = setInterval(updateEcosystem, GENERATION_TIME);
        updateControls();
    }
}

function pauseSimulation() {
    if (isRunning) {
        isRunning = false;
        clearInterval(simulationInterval);
        updateControls();
    }
}

function resetSimulation() {
    pauseSimulation();
    initSimulation();
    updateControls();
}

function updateControls() {
    startButton.disabled = isRunning;
    pauseButton.disabled = !isRunning;
}

// Sets the simulation speed and restarts the interval if running
function setSimulationSpeed(sliderValue) {
    // Invert: 1 (slowest, 1000ms) to 20 (fastest, 50ms)
    GENERATION_TIME = 1000 / parseInt(sliderValue);

    let speedLabel;
    const val = parseInt(sliderValue);
    if (val < 7) speedLabel = "Slow";
    else if (val < 14) speedLabel = "Medium";
    else speedLabel = "Fast";

    speedValueSpan.textContent = speedLabel;

    if (isRunning) {
        clearInterval(simulationInterval);
        simulationInterval = setInterval(updateEcosystem, GENERATION_TIME);
    }
}

// --- Event Listeners ---
startButton.addEventListener('click', startSimulation);
pauseButton.addEventListener('click', pauseSimulation);
resetButton.addEventListener('click', resetSimulation);
migrationRateSlider.addEventListener('input', (event) => {
    MIGRATION_PERCENTAGE = parseFloat(event.target.value) / 100;
    migrationRateValueSpan.textContent = `${event.target.value}%`;
});
migrationIntervalSlider.addEventListener('input', (event) => {
    MIGRATION_INTERVAL = parseInt(event.target.value);
    migrationIntervalValueSpan.textContent = `${MIGRATION_INTERVAL} gen`;
});

migrationStartGenDropdown.addEventListener('change', (event) => {
    MIGRATION_START_GENERATION = parseInt(event.target.value);
    console.log('Migration will start at generation:', MIGRATION_START_GENERATION);
});

replacementStrategyDropdown.addEventListener('change', (event) => {
    REPLACEMENT_STRATEGY = event.target.value;
    console.log('Migration Replacement Strategy set to:', REPLACEMENT_STRATEGY);
});

speedSlider.addEventListener('input', (event) => {
    setSimulationSpeed(parseInt(event.target.value));
});

// Initial setup
initSimulation();