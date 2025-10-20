import React from 'react'
import ReactDOM from 'react-dom/client'
import * as d3 from 'd3'
import './styles.css'

// D3.js Graph Visualizer Component
const D3StoryGraph = ({ story }) => {
  const svgRef = React.useRef()

  React.useEffect(() => {
    if (!story) return

    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove() // Clear previous render

    const width = 1200
    const height = 800

    // Set up SVG
    svg.attr("width", width).attr("height", height)

    // Create zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        container.attr("transform", event.transform)
      })

    svg.call(zoom)

    const container = svg.append("g")

    // Prepare data
    const { nodes, links, missingNodes } = prepareGraphData(story)

    // Create force simulation with initial positioning
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("collision", d3.forceCollide().radius(45))
      .force("x", d3.forceX(d => 100 + (d.distance * 150)).strength(0.3))
      .force("y", d3.forceY(height / 2).strength(0.1))

    // Create arrow markers
    svg.append("defs").selectAll("marker")
      .data(["arrow"])
      .enter().append("marker")
      .attr("id", d => d)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#999")

    // Create links
    const link = container.append("g")
      .selectAll("line")
      .data(links)
      .enter().append("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 2)
      .attr("marker-end", "url(#arrow)")

    // Create nodes
    const node = container.append("g")
      .selectAll("g")
      .data(nodes)
      .enter().append("g")
      .attr("class", "graph-node")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended))

    // Add circles for nodes
    node.append("circle")
      .attr("r", 20)
      .attr("fill", d => {
        if (d.missing) return "#ff6b6b"
        if (d.isStart) return "#48bb78"
        if (d.isEnd) return "#f56565"
        return "#667eea"
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)

    // Add labels
    node.append("text")
      .text(d => d.id)
      .attr("x", 0)
      .attr("y", -25)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .attr("fill", "#333")

    // Add choice count
    node.append("text")
      .text(d => d.missing ? "❌" : `${d.choiceCount} choices`)
      .attr("x", 0)
      .attr("y", 35)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "#666")

    // Add tooltips
    node.append("title")
      .text(d => d.missing ? `Missing node: ${d.id}` : `${d.id}\n${d.text.substring(0, 100)}...`)

    // Update positions on simulation tick
    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y)

      node
        .attr("transform", d => `translate(${d.x},${d.y})`)
    })

    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    }

    function dragged(event, d) {
      d.fx = event.x
      d.fy = event.y
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null
    }

  }, [story])

  return <svg ref={svgRef} style={{ width: '100%', height: '100%', border: '1px solid #ddd' }}></svg>
}

// Helper function to get total choice count (regular choices + dice outcomes)
const getNodeChoiceCount = (nodeData) => {
  let count = 0
  if (nodeData.choices) {
    count += nodeData.choices.length
  }
  if (nodeData.roll && nodeData.roll.outcomes) {
    count += nodeData.roll.outcomes.length
  }
  return count
}

// Prepare data for D3 graph
const prepareGraphData = (story) => {
  const existingNodes = new Set(Object.keys(story.nodes))
  const referencedNodes = new Set()
  const missingNodeIds = new Set()

  // Collect all referenced nodes
  Object.values(story.nodes).forEach(node => {
    if (node.choices) {
      node.choices.forEach(choice => {
        referencedNodes.add(choice.next)
        if (!existingNodes.has(choice.next)) {
          missingNodeIds.add(choice.next)
        }
      })
    }
    if (node.roll && node.roll.outcomes) {
      node.roll.outcomes.forEach(outcome => {
        referencedNodes.add(outcome.next)
        if (!existingNodes.has(outcome.next)) {
          missingNodeIds.add(outcome.next)
        }
      })
    }
  })

  // Calculate distances from start node using BFS
  const calculateDistances = () => {
    const distances = {}
    const queue = [{ nodeId: story.startNode, distance: 0 }]
    const visited = new Set()

    while (queue.length > 0) {
      const { nodeId, distance } = queue.shift()

      if (visited.has(nodeId)) continue
      visited.add(nodeId)
      distances[nodeId] = distance

      const node = story.nodes[nodeId]
      if (node) {
        // Handle regular choices
        if (node.choices) {
          node.choices.forEach(choice => {
            if (!visited.has(choice.next)) {
              queue.push({ nodeId: choice.next, distance: distance + 1 })
            }
          })
        }
        // Handle dice roll outcomes
        if (node.roll && node.roll.outcomes) {
          node.roll.outcomes.forEach(outcome => {
            if (!visited.has(outcome.next)) {
              queue.push({ nodeId: outcome.next, distance: distance + 1 })
            }
          })
        }
      }
    }

    return distances
  }

  const distances = calculateDistances()

  // Create nodes array
  const nodes = []

  // Add existing nodes
  Object.entries(story.nodes).forEach(([nodeId, nodeData]) => {
    const distance = distances[nodeId] || 0
    nodes.push({
      id: nodeId,
      text: nodeData.text,
      isStart: nodeId === story.startNode,
      isEnd: nodeData.isEnd || false,
      choiceCount: getNodeChoiceCount(nodeData),
      missing: false,
      distance: distance,
      // Set initial position based on distance from start
      x: 100 + (distance * 150), // Start at x=100, then 150px per level
      y: 400 + (Math.random() - 0.5) * 200 // Random y with some spread
    })
  })

  // Add missing nodes
  missingNodeIds.forEach(nodeId => {
    const distance = distances[nodeId] || 999
    nodes.push({
      id: nodeId,
      text: "Missing node",
      isStart: false,
      isEnd: false,
      choiceCount: 0,
      missing: true,
      distance: distance,
      x: 100 + (distance * 150),
      y: 400 + (Math.random() - 0.5) * 200
    })
  })

  // Create links array
  const links = []
  Object.entries(story.nodes).forEach(([nodeId, nodeData]) => {
    // Add links for regular choices
    if (nodeData.choices) {
      nodeData.choices.forEach(choice => {
        links.push({
          source: nodeId,
          target: choice.next,
          choiceText: choice.text
        })
      })
    }
    // Add links for dice roll outcomes
    if (nodeData.roll && nodeData.roll.outcomes) {
      nodeData.roll.outcomes.forEach(outcome => {
        links.push({
          source: nodeId,
          target: outcome.next,
          choiceText: `${outcome.range}: ${outcome.text}`
        })
      })
    }
  })

  return {
    nodes,
    links,
    missingNodes: Array.from(missingNodeIds)
  }
}

// React component for the Story Editor
const StoryEditor = ({ story, onClose }) => {
  const { missingNodes } = story ? prepareGraphData(story) : { missingNodes: [] }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <div className="visualization-header">
        <h2>Story Decision Graph</h2>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      {missingNodes.length > 0 && (
        <div className="missing-nodes-warning" style={{ margin: '10px 20px' }}>
          <h4>⚠️ Missing Nodes ({missingNodes.length}):</h4>
          <div className="missing-list">
            {missingNodes.map(nodeId => (
              <span key={nodeId} className="missing-node">{nodeId}</span>
            ))}
          </div>
        </div>
      )}

      <div className="graph-legend" style={{ margin: '10px 20px', fontSize: '12px' }}>
        <span style={{ color: '#48bb78' }}>🟢 Start Node</span> |
        <span style={{ color: '#f56565' }}> 🔴 End Node</span> |
        <span style={{ color: '#667eea' }}> 🔵 Regular Node</span> |
        <span style={{ color: '#ff6b6b' }}> ❌ Missing Node</span>
        <br />
        <em>Drag nodes to rearrange • Zoom with mouse wheel • Hover for details</em>
      </div>

      <div style={{ height: 'calc(100% - 120px)' }}>
        <D3StoryGraph story={story} />
      </div>
    </div>
  )
}

class StoryGame {
  constructor() {
    this.story = null
    this.currentNode = null
    this.flumeRoot = null
    this.nodeHistory = [] // Track visited nodes for back button
    this.inventory = [] // Track collected items
    this.storyId = this.getStoryIdFromUrl()
    this.saveKey = `${this.storyId}-save`
    this.speechKey = 'speech-enabled' // Generic speech setting
    this.currentSpeech = null // Track current speech synthesis
    this.currentAudio = null // Track current audio playback
    this.speechEnabled = this.loadSpeechSetting() // Load speech setting from localStorage
    this.speechActivated = false // Track if user has activated speech
    this.init()
  }

  getStoryIdFromUrl() {
    const path = window.location.pathname
    const match = path.match(/\/story\/([^\/]+)/)
    return match ? match[1] : null
  }

  async init() {
    if (!this.storyId) {
      this.showStoryIndex()
      return
    }
    await this.loadStory()
    this.injectCapabilityUI()
    this.setupEventListeners()
    this.loadGameState()
  }

  async loadStory() {
    try {
      const response = await fetch(`/${this.storyId}/story.json`)
      this.story = await response.json()

      // Update page title and header
      const storiesResponse = await fetch('/stories.json')
      const storiesData = await storiesResponse.json()
      const storyInfo = storiesData.stories.find(s => s.id === this.storyId)

      if (storyInfo) {
        document.title = storyInfo.title
        document.getElementById('gameTitle').textContent = storyInfo.title
      }

      console.log('Story loaded successfully:', this.story)
    } catch (error) {
      console.error('Failed to load story:', error)
    }
  }

  injectCapabilityUI() {
    const storyText = document.getElementById('storyText')
    
    // Inject inventory UI (always present but subtle)
    const inventoryHTML = `
      <div id="inventoryBar" class="inventory-bar">
        <span class="inventory-label">🎒</span>
        <div id="inventoryItems" class="inventory-items"></div>
      </div>
    `
    storyText.insertAdjacentHTML('beforebegin', inventoryHTML)
    
    // Inject progress bar HTML if story supports diamond collection
    if (this.story?.capabilities?.diamondCollection) {
      const progressBarHTML = `
        <div id="progressBar" class="progress-bar" style="display: none;">
          <div class="progress-label">💎 Diamonds Collected:</div>
          <div id="diamondProgress" class="diamond-progress">
            <span class="diamond-slot" data-diamond="red">🔴</span>
            <span class="diamond-slot" data-diamond="blue">🔵</span>
            <span class="diamond-slot" data-diamond="green">🟢</span>
            <span class="diamond-slot" data-diamond="yellow">🟡</span>
            <span class="diamond-slot" data-diamond="purple">🟣</span>
          </div>
        </div>
      `
      
      storyText.insertAdjacentHTML('beforebegin', progressBarHTML)
    }
  }

  async showStoryIndex() {
    try {
      const response = await fetch('/stories.json')
      const storiesData = await response.json()
      this.renderStoryIndex(storiesData.stories)
    } catch (error) {
      console.error('Failed to load stories:', error)
    }
  }

  renderStoryIndex(stories) {
    // Filter out work-in-progress stories
    const publishedStories = stories.filter(story => !story['work-in-progress'])
    
    document.body.innerHTML = `
            <div class="story-index">
                <header class="index-header">
                    <h1>📚 Story Collection</h1>
                    <p>Choose your adventure!</p>
                </header>
                <div class="stories-grid">
                    ${publishedStories.map(story => `
                        <div class="story-card" onclick="window.location.href='/story/${story.id}'">
                            <img src="/${story.id}/cover.png" alt="${story.title}" class="story-preview">
                            <div class="story-info">
                                <h3>${story.title}</h3>
                                <p class="story-description">${story.description}</p>
                                <p class="story-author">by ${story.author}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `
  }

  setupEventListeners() {
    // Tab switching
    document.getElementById('gameTab').addEventListener('click', () => {
      this.showView('gameView')
      this.setActiveTab('gameTab')
    })

    document.getElementById('visualizeTab').addEventListener('click', () => {
      this.showView('visualizeView')
      this.setActiveTab('visualizeTab')
      this.renderStoryMap()
    })

    // Restart button
    document.getElementById('restartBtn').addEventListener('click', () => {
      this.startGame()
    })

    // Back button (we'll add this to the HTML)
    document.getElementById('backBtn').addEventListener('click', () => {
      this.goBack()
    })

    // Top restart button
    document.getElementById('topRestartBtn').addEventListener('click', () => {
      this.confirmRestart()
    })

    // Speech toggle button
    document.getElementById('speechToggle').addEventListener('click', () => {
      this.toggleSpeech()
    })

    // Initialize speech button state
    this.updateSpeechButton()
  }

  showView(viewId) {
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active')
    })
    document.getElementById(viewId).classList.add('active')
  }

  setActiveTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active')
    })
    document.getElementById(tabId).classList.add('active')
  }

  startGame() {
    if (!this.story) return

    this.currentNode = this.story.startNode
    this.nodeHistory = [] // Reset history when starting new game
    this.inventory = [] // Reset inventory when starting new game
    this.saveGameState()
    this.renderCurrentNode()
    document.getElementById('restartBtn').style.display = 'none'
  }

  confirmRestart() {
    const confirmed = confirm('🎮 Start a new game? This will erase your current progress!')
    if (confirmed) {
      this.clearSaveData()
      this.startGame()
    }
  }

  saveGameState() {
    const gameState = {
      currentNode: this.currentNode,
      nodeHistory: this.nodeHistory,
      inventory: this.inventory,
      timestamp: Date.now()
    }

    // Only include diamondsCollected if story supports it
    if (this.story?.capabilities?.diamondCollection) {
      gameState.diamondsCollected = this.getDiamondsCollected()
    }

    localStorage.setItem(this.saveKey, JSON.stringify(gameState))
    console.log('Game state saved:', gameState)
  }

  collectItem(itemId) {
    if (!this.inventory.includes(itemId)) {
      this.inventory.push(itemId)
      this.updateInventoryUI()
      this.saveGameState()
      console.log(`Collected item: ${itemId}`)
    }
  }

  hasItem(itemId) {
    return this.inventory.includes(itemId)
  }

  removeItem(itemId) {
    const index = this.inventory.indexOf(itemId)
    if (index > -1) {
      this.inventory.splice(index, 1)
      this.updateInventoryUI()
      this.saveGameState()
      console.log(`Removed item: ${itemId}`)
    }
  }

  updateInventoryUI() {
    const inventoryBar = document.getElementById('inventoryBar')
    const inventoryItems = document.getElementById('inventoryItems')
    if (!inventoryBar || !inventoryItems) return

    if (this.inventory.length === 0) {
      inventoryBar.style.display = 'none'
    } else {
      inventoryBar.style.display = 'flex'
      inventoryItems.innerHTML = this.inventory.map(item => 
        `<span class="inventory-item">${this.getItemDisplayName(item)}</span>`
      ).join('')
    }
  }

  getItemDisplayName(itemId) {
    return (itemId)
    // const displayNames = {
    //   'magic_flowers': 'Magic Flowers',
    //   'glowing_crystals': 'Glowing Crystals',
    //   'ancient_knowledge': 'Ancient Knowledge'
    // }
    // return displayNames[itemId] || itemId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  getDiamondsCollected() {
    // Get visited node IDs from history (handle both old and new formats)
    const visitedNodes = this.nodeHistory.map(entry => 
      typeof entry === 'string' ? entry : entry.node
    )

    // Check which diamonds have been collected based on visited nodes
    const diamonds = {
      red: visitedNodes.includes('dino_jumping_contest') || this.currentNode === 'dino_jumping_contest',
      blue: visitedNodes.includes('rocks_love_speech') || this.currentNode === 'rocks_love_speech',
      green: visitedNodes.includes('roman_salute') || this.currentNode === 'roman_salute',
      yellow: visitedNodes.includes('egypt_riddle_correct') || this.currentNode === 'egypt_riddle_correct',
      purple: visitedNodes.includes('space_walk_moves') || this.currentNode === 'space_walk_moves'
    }
    return diamonds
  }

  updateDiamondProgressBar() {
    const progressBar = document.getElementById('progressBar')


    const diamonds = this.getDiamondsCollected()

    // Show progress bar after accepting the mission
    if (this.nodeHistory.includes('accept_mission') || this.currentNode === 'accept_mission') {
      progressBar.style.display = 'block'

      // Update diamond indicators
      Object.entries(diamonds).forEach(([color, collected]) => {
        const slot = document.querySelector(`[data-diamond="${color}"]`)
        if (slot) {
          slot.style.opacity = collected ? '1' : '0.3'
          slot.style.transform = collected ? 'scale(1.2)' : 'scale(1)'
        }
      })
    } else {
      progressBar.style.display = 'none'
    }
  }

  loadGameState() {
    try {
      const savedState = localStorage.getItem(this.saveKey)
      if (savedState) {
        const gameState = JSON.parse(savedState)
        this.currentNode = gameState.currentNode
        this.inventory = gameState.inventory || []
        
        // Handle backward compatibility for nodeHistory format
        const rawHistory = gameState.nodeHistory || []
        if (rawHistory.length > 0 && typeof rawHistory[0] === 'string') {
          // Old format: array of node IDs, convert to new format
          this.nodeHistory = rawHistory.map(nodeId => ({
            node: nodeId,
            inventory: [] // Can't recover old inventory states
          }))
        } else {
          // New format: array of {node, inventory} objects
          this.nodeHistory = rawHistory
        }
        console.log('Game state loaded:', gameState)
        this.renderCurrentNode()

        // Show a welcome back message
        this.showWelcomeBackMessage()
      } else {
        // No saved game, start fresh
        this.startGame()
      }
    } catch (error) {
      console.error('Error loading game state:', error)
      this.startGame()
    }
  }

  clearSaveData() {
    localStorage.removeItem(this.saveKey)
    console.log('Save data cleared')
  }

  loadSpeechSetting() {
    try {
      const saved = localStorage.getItem(this.speechKey)
      return saved !== null ? JSON.parse(saved) : true // Default to enabled
    } catch (error) {
      return true // Default to enabled if error
    }
  }

  saveSpeechSetting() {
    localStorage.setItem(this.speechKey, JSON.stringify(this.speechEnabled))
  }

  showWelcomeBackMessage() {
    this.showToast('💾 Welcome back! Your adventure continues...', 4000)
  }

  showToast(message, duration = 3000) {
    // Create toast element
    const toast = document.createElement('div')
    toast.className = 'toast-notification'
    toast.textContent = message

    // Add toast styles
    toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.95) 0%, rgba(118, 75, 162, 0.95) 100%);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 2000;
            font-size: 14px;
            font-weight: bold;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 300px;
        `

    // Add to page
    document.body.appendChild(toast)

    // Animate in
    setTimeout(() => {
      toast.style.transform = 'translateX(0)'
    }, 100)

    // Remove after duration
    setTimeout(() => {
      toast.style.transform = 'translateX(100%)'
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast)
        }
      }, 300)
    }, duration)
  }

  renderCurrentNode() {
    const node = this.story.nodes[this.currentNode]
    if (!node) return

    // Update story text
    document.getElementById('storyText').textContent = node.text

    // Update or add image if available
    this.updateNodeImage(this.currentNode)

    // Read the text aloud with a small delay to ensure DOM is updated
    setTimeout(() => {
      this.speakText(node.text)
    }, 100)

    // Clear and update choices
    const choicesContainer = document.getElementById('choices')
    choicesContainer.innerHTML = ''

    if (node.roll) {
      // Handle dice roll mechanic
      this.renderDiceRoll(node.roll, choicesContainer)
    } else if (node.choices && node.choices.length > 0) {
      // Handle regular choices
      node.choices.forEach((choice) => {
        const button = document.createElement('button')
        const hasRequiredItem = !choice.item || this.hasItem(choice.item)
        
        // Create the main button content
        const buttonContent = document.createElement('div')
        buttonContent.className = 'choice-content'
        
        const choiceText = document.createElement('span')
        choiceText.textContent = choice.text
        buttonContent.appendChild(choiceText)
        
        // Add item badges if needed
        if (choice.item) {
          const badge = document.createElement('span')
          badge.className = hasRequiredItem ? 'item-badge uses-badge' : 'item-badge requires-badge'
          badge.textContent = hasRequiredItem ? `${this.getItemDisplayName(choice.item)} is used` : `${this.getItemDisplayName(choice.item)} is needed`
          buttonContent.appendChild(badge)
        }
        
        if (hasRequiredItem) {
          button.className = 'choice-btn'
          button.addEventListener('click', () => {
            this.makeChoice(choice.next, choice)
          })
        } else {
          button.className = 'choice-btn choice-btn-disabled'
          button.disabled = true
        }
        
        button.appendChild(buttonContent)
        choicesContainer.appendChild(button)
      })
    } else if (node.isEnd) {
      // Show restart button for end nodes
      document.getElementById('restartBtn').style.display = 'block'
    }

    // Show/hide back button
    const backBtn = document.getElementById('backBtn')
    if (this.nodeHistory.length > 0) {
      backBtn.style.display = 'block'
    } else {
      backBtn.style.display = 'none'
    }

    // Handle item collection
    if (node.collectItem) {
      this.collectItem(node.collectItem)
    }

    // Update inventory UI
    this.updateInventoryUI()

    if (this.story?.capabilities?.diamondCollection) {
      this.updateDiamondProgressBar()
    }
  }

  parseRange(rangeStr) {
    // Parse range strings like "1-3", "4", "5-12"
    if (rangeStr.includes('-')) {
      const [min, max] = rangeStr.split('-').map(n => parseInt(n.trim()))
      return { min, max }
    } else {
      const num = parseInt(rangeStr.trim())
      return { min: num, max: num }
    }
  }

  renderDiceRoll(roll, container) {
    const diceContainer = document.createElement('div')
    diceContainer.className = 'dice-container'

    const diceButton = document.createElement('button')
    diceButton.className = 'dice-btn'
    diceButton.textContent = roll.text
    diceButton.addEventListener('click', () => {
      this.rollDice(roll.outcomes, diceButton, outcomesContainer)
    })

    // Show potential outcomes
    const outcomesContainer = document.createElement('div')
    outcomesContainer.className = 'dice-outcomes'

    const outcomesTitle = document.createElement('div')
    outcomesTitle.className = 'outcomes-title'
    outcomesTitle.textContent = 'Possible outcomes:'
    outcomesContainer.appendChild(outcomesTitle)

    roll.outcomes.forEach(outcome => {
      const outcomeDiv = document.createElement('div')
      outcomeDiv.className = 'dice-outcome'

      outcomeDiv.innerHTML = `
        <span class="outcome-range">🎲 ${outcome.range}:</span>
        <span class="outcome-text">${outcome.text}</span>
      `

      outcomesContainer.appendChild(outcomeDiv)
    })

    diceContainer.appendChild(diceButton)
    diceContainer.appendChild(outcomesContainer)
    container.appendChild(diceContainer)
  }

  rollDice(outcomes, button, outcomesContainer) {
    // Stop current speech
    this.stopSpeech()

    // Calculate the dice range from outcomes
    const parsedRanges = outcomes.map(o => this.parseRange(o.range))
    const minRoll = Math.min(...parsedRanges.map(r => r.min))
    const maxRoll = Math.max(...parsedRanges.map(r => r.max))
    const diceRange = maxRoll - minRoll + 1

    // Disable button and show rolling animation
    button.disabled = true
    button.textContent = '🎲 Rolling...'

    // Animate the dice roll
    let rollCount = 0
    const rollAnimation = setInterval(() => {
      const animRoll = Math.floor(Math.random() * diceRange) + minRoll
      button.textContent = `🎲 ${animRoll}`
      rollCount++

      if (rollCount >= 10) {
        clearInterval(rollAnimation)

        // Final roll
        const finalRoll = Math.floor(Math.random() * diceRange) + minRoll
        button.textContent = `🎲 ${finalRoll}`

        // Find matching outcome
        const outcome = outcomes.find(o => {
          const range = this.parseRange(o.range)
          return finalRoll >= range.min && finalRoll <= range.max
        })

        if (outcome) {
          // Highlight the winning outcome
          const outcomeElements = outcomesContainer.querySelectorAll('.dice-outcome')
          const winningIndex = outcomes.findIndex(o => o === outcome)
          if (outcomeElements[winningIndex]) {
            outcomeElements[winningIndex].classList.add('winning-outcome')
          }

          // Show result text
          setTimeout(() => {
            button.textContent = `🎲 ${finalRoll} - ${outcome.text}`
            this.speakText(outcome.text)

            // Continue to next node after delay
            setTimeout(() => {
              this.makeChoice(outcome.next)
            }, 2000)
          }, 500)
        }
      }
    }, 100)
  }

  makeChoice(nextNodeId, choiceData = null) {
    // Stop current speech before moving to next node
    this.stopSpeech()

    // Remove item from inventory if choice required one
    if (choiceData && choiceData.item && this.hasItem(choiceData.item)) {
      this.removeItem(choiceData.item)
    }

    // Save current state to history before moving
    if (this.currentNode) {
      const currentState = {
        node: this.currentNode,
        inventory: [...this.inventory] // Create a copy of current inventory
      }
      
      // Only add if it's not already the last entry (avoid duplicates)
      const lastEntry = this.nodeHistory[this.nodeHistory.length - 1]
      if (!lastEntry || lastEntry.node !== this.currentNode) {
        this.nodeHistory.push(currentState)
      }
    }

    this.currentNode = nextNodeId
    this.saveGameState() // Auto-save after each choice
    this.renderCurrentNode()
  }

  goBack() {
    if (this.nodeHistory.length > 0) {
      // Stop current speech before going back
      this.stopSpeech()

      // Restore previous state (node + inventory)
      const previousState = this.nodeHistory.pop()
      this.currentNode = previousState.node
      this.inventory = [...previousState.inventory] // Restore inventory state
      
      this.saveGameState() // Auto-save when going back
      this.renderCurrentNode()
    }
  }

  renderStoryMap() {
    console.log('Rendering story map with story:', this.story)
    const container = document.getElementById('flume-editor')

    if (this.flumeRoot) {
      this.flumeRoot.unmount()
    }

    if (!this.story) {
      console.error('No story data available for visualization')
      return
    }

    this.flumeRoot = ReactDOM.createRoot(container)
    this.flumeRoot.render(
      React.createElement(StoryEditor, {
        story: this.story,
        onClose: () => {
          this.showView('gameView')
          this.setActiveTab('gameTab')
        }
      })
    )
  }

  updateNodeImage(nodeId) {
    // Check if image exists for this node
    const imagePath = `/${this.storyId}/generated-images/${nodeId}.png`

    // Get the existing image container
    const imageContainer = document.getElementById('nodeImage')
    if (!imageContainer) return

    // Try to load the image
    const img = new Image()
    img.onload = () => {
      // Image exists, display it
      imageContainer.innerHTML = `
                <img src="${imagePath}" alt="Scene illustration for ${nodeId}" class="node-image" />
            `
      imageContainer.style.display = 'flex'
    }
    img.onerror = () => {
      // Image doesn't exist, show placeholder
      imageContainer.innerHTML = `
                <div style="color: rgba(255,255,255,0.6); text-align: center; font-style: italic;">
                    🎨<br>No illustration<br>available
                </div>
            `
      imageContainer.style.display = 'flex'
    }
    img.src = imagePath
  }

  async speakText(text) {
    // Don't speak if speech is disabled
    if (!this.speechEnabled) {
      return
    }

    // Stop any currently playing speech/audio
    this.stopSpeech()

    // Try to load and play generated voiceover first
    const voiceoverPath = `/${this.storyId}/generated-voiceovers/${this.currentNode}.mp3`
    
    try {
      // Check if voiceover file exists by attempting to load it
      const audio = new Audio(voiceoverPath)
      
      // Set up audio event handlers
      audio.onloadeddata = () => {
        console.log(`🎙️ Playing generated voiceover for ${this.currentNode}`)
        this.currentAudio = audio
        audio.play().catch(error => {
          console.log('Failed to play voiceover, falling back to TTS:', error.message)
          this.fallbackToTTS(text)
        })
      }
      
      audio.onerror = () => {
        console.log(`No voiceover found for ${this.currentNode}, using browser TTS`)
        this.fallbackToTTS(text)
      }
      
      audio.onended = () => {
        this.currentAudio = null
      }
      
      // Set volume and attempt to load
      audio.volume = 0.8
      audio.load()
      
    } catch (error) {
      console.log('Error loading voiceover, falling back to TTS:', error.message)
      this.fallbackToTTS(text)
    }
  }

  fallbackToTTS(text) {
    // Check if speech synthesis is supported
    if (!('speechSynthesis' in window)) {
      console.log('Speech synthesis not supported')
      return
    }

    // Clean up the text for better speech
    let cleanText = text
      .replace(/🚨/g, 'Alarm!')
      .replace(/🦕/g, 'dinosaur')
      .replace(/💎/g, 'diamond')
      .replace(/⚔️/g, 'sword')
      .replace(/🏺/g, 'ancient')
      .replace(/🚀/g, 'rocket')
      .replace(/🎉/g, 'celebration')
      .replace(/'/g, "'") // Fix smart quotes
      .replace(/'/g, "'")
      .replace(/"/g, '"')
      .replace(/"/g, '"')

    // Create speech synthesis utterance
    this.currentSpeech = new SpeechSynthesisUtterance(cleanText)

    // Configure speech settings
    this.currentSpeech.rate = 0.9
    this.currentSpeech.pitch = 1.1
    this.currentSpeech.volume = 0.8

    // Wait for voices to load, then set voice and speak
    const speakWithVoice = () => {
      const voices = speechSynthesis.getVoices()

      if (voices.length > 0) {
        // Try to find a good English voice
        const preferredVoice = voices.find(voice =>
          voice.lang.startsWith('en') &&
          (voice.name.includes('Google') || voice.name.includes('Microsoft') || voice.name.includes('Samantha') || voice.name.includes('Alex'))
        ) || voices.find(voice => voice.lang.startsWith('en')) || voices[0]

        if (preferredVoice) {
          this.currentSpeech.voice = preferredVoice
        }
      }

      // Add event listeners
      this.currentSpeech.onend = () => {
        this.currentSpeech = null
      }

      this.currentSpeech.onerror = (event) => {
        this.currentSpeech = null
      }

      // Speak the text
      speechSynthesis.speak(this.currentSpeech)
    }

    // Check if voices are already loaded
    if (speechSynthesis.getVoices().length > 0) {
      speakWithVoice()
    } else {
      // Wait for voices to load
      speechSynthesis.addEventListener('voiceschanged', speakWithVoice, { once: true })

      // Fallback timeout in case voiceschanged doesn't fire
      setTimeout(() => {
        if (this.currentSpeech && speechSynthesis.getVoices().length === 0) {
          speechSynthesis.speak(this.currentSpeech)
        }
      }, 1000)
    }
  }

  stopSpeech() {
    // Stop browser TTS
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel()
    }
    this.currentSpeech = null
    
    // Stop audio playback
    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio.currentTime = 0
      this.currentAudio = null
    }
  }

  toggleSpeech() {
    this.speechEnabled = !this.speechEnabled
    this.saveSpeechSetting() // Save the setting
    this.updateSpeechButton()

    if (!this.speechEnabled) {
      this.stopSpeech() // Stop any current speech when disabling
    }
  }

  updateSpeechButton() {
    const speechButton = document.getElementById('speechToggle')
    if (!speechButton) return

    if (this.speechEnabled) {
      speechButton.textContent = '🔊 Speech'
      speechButton.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    } else {
      speechButton.textContent = '🔇 Muted'
      speechButton.style.background = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
    }
  }



  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new StoryGame()
})