### define
jquery : $
underscore : _
../../libs/request : Request
../../libs/event_mixin : EventMixin
./tracepoint : TracePointClass
./tracetree : TraceTreeClass
###

# This takes care of the route. 
  
# Constants
BUFFER_SIZE = 262144 # 1024 * 1204 / 4
PUSH_THROTTLE_TIME = 30000 # 30s
INIT_TIMEOUT = 10000 # 10s
TYPE_USUAL = 0
TYPE_BRANCH = 1
# Max and min radius in base voxels (see scaleInfo.baseVoxel)
MIN_RADIUS = 1
MAX_RADIUS = 1000

class Route
  
  branchStack : []
  trees : []
  comments : []
  activeNode : null
  activeTree : null

  constructor : (@data, dataSet, @scaleInfo, @flycam) ->

    _.extend(this, new EventMixin())

    #@branchStack = @data.branchPoints.map (a) -> new Float32Array(a)
    #@branchStack = (@data.trees[branchPoint.treeId].nodes[branchPoint.id].position for branchPoint in @data.branchPoints) # when @data.trees[branchPoint.treeId]?.id? == branchPoint.treeId)

    @idCount = 1
    @treeIdCount = 1
    @trees = []
    @comments = []
    @activeNode = null
    # Used to save in NML file, is always defined
    @lastActiveNodeId = 1
    @activeTree = null

    # For trees that are disconnected
    lostTrees = []

    @doubleBranchPop = false
    @savedCurrentState = true

    ############ Load Tree from @data ##############

    # get tree to build
    for treeData in @data.trees
      # Create new tree
      tree = new TraceTree(treeData.id, new THREE.Color().setRGB(treeData.color[0..2]...).getHex())
      # Initialize nodes
      i = 0
      for node in treeData.nodes
        if node
          tree.nodes.push(new TracePoint(TYPE_USUAL, node.id, node.position, node.radius))
          # idCount should be bigger than any other id
          @idCount = Math.max(node.id + 1, @idCount);
      # Initialize edges
      for edge in treeData.edges
        sourceNode = @findNodeInList(tree.nodes, edge.source)
        targetNode  = @findNodeInList(tree.nodes, edge.target)
        sourceNode.appendNext(targetNode)
        targetNode.appendNext(sourceNode)
      # Set active Node
      activeNodeT = @findNodeInList(tree.nodes, @data.activeNode)
      if activeNodeT
        @activeNode = activeNodeT
        @lastActiveNodeId = @activeNode.id
        # Active Tree is the one last added
        @activeTree = tree

      @treeIdCount = Math.max(tree.treeId + 1, @treeIdCount)
      @trees.push(tree)
    
    # Set branchpoints
    nodeList = @getNodeListOfAllTrees()
    for branchpoint in @data.branchPoints
      node = @findNodeInList(nodeList, branchpoint.id)
      if node?
        node.type = TYPE_BRANCH
        @branchStack.push(node)

    if @data.comments?
      @comments = @data.comments
      
    unless @activeTree
      if @trees.length > 0
        @activeTree = @trees[0]
      else
        @createNewTree()

    $(window).on(
      "beforeunload"
      =>
        if !@savedCurrentState
          @pushImpl()
          return "You haven't saved your progress, please give us 2 seconds to do so and and then leave this site."
        else
          return
    )

  # Returns an object that is structured the same way as @data is
  exportToNML : ->
    result = @data
    result.activeNode = @lastActiveNodeId
    result.branchPoints = []
    # Get Branchpoints
    for branchPoint in @branchStack
      result.branchPoints.push({id : branchPoint.id})
    result.editPosition = @flycam.getGlobalPos()
    result.comments = @comments
    result.trees = []
    for tree in @trees
      # Don't save empty trees (id is null)
      if tree.nodes.length
        nodes = tree.nodes
        treeObj = {}
        result.trees.push(treeObj)
        treeColor = new THREE.Color(tree.color)
        treeObj.color = [treeColor.r, treeColor.g, treeColor.b, 1]
        treeObj.edges = []
        # Get Edges
        for node in nodes
          for neighbor in node.neighbors
            if node.id < neighbor.id  # to prevent saving the same edge twice
              treeObj.edges.push({source : node.id, target : neighbor.id})
        treeObj.id = tree.treeId
        treeObj.nodes = []
        # Get Nodes
        for node in nodes
          treeObj.nodes.push({
            id : node.id
            position : node.pos
            radius : node.radius
            # TODO: Those are dummy values
            viewport : 0
            timestamp : 0
            resolution : 0
          })

#    console.log "NML-Objekt"
#    console.log result
    return result


  push : ->
    @savedCurrentState = false
    @pushDebounced()

  # Pushes the buffered route to the server. Pushing happens at most 
  # every 30 seconds.
  pushDebounced : ->
    @pushDebounced = _.throttle(_.mutexDeferred(@pushImpl, -1), PUSH_THROTTLE_TIME)
    @pushDebounced()

  pushImpl : ->

    deferred = new $.Deferred()

    Request.send(
      url : "/tracing/#{@data.id}"
      method : "PUT"
      data : @exportToNML()
      contentType : "application/json"
    )
    .fail =>
      @push()
      deferred.reject()
    .done =>
      @savedCurrentState = true
      deferred.resolve()

  # INVARIANTS:
  # activeTree: either sentinel (activeTree.isSentinel==true) or valid node with node.parent==null
  # activeNode: either null only if activeTree is empty (sentinel) or valid node

  pushBranch : ->

    if @activeNode
      @branchStack.push(@activeNode)
      @activeNode.type = TYPE_BRANCH
      @push()

      @trigger("setBranch", true)

  popBranch : ->
    deferred = new $.Deferred()
    if @doubleBranchPop
      @showBranchModal().done(=>
        point = @branchStack.pop()
        @push()
        if point
          @activeNode = point
          @activeNode.type = TYPE_USUAL

          @trigger("setBranch", false)
          @doubleBranchPop = true
          deferred.resolve(@activeNode.id)
        else
          @trigger("emptyBranchStack")
          deferred.reject())
    else
      point = @branchStack.pop()
      @push()
      if point
        @activeNode = point
        @activeNode.type = TYPE_USUAL

        @trigger("setBranch", false)
        @doubleBranchPop = true
        deferred.resolve(@activeNode.id)
      else
        @trigger("emptyBranchStack")
        deferred.reject()
    deferred

  showBranchModal : ->
    @branchDeferred = new $.Deferred()
    $("#double-jump").modal("show")
    return @branchDeferred

  rejectBranchDeferred : ->
    @branchDeferred.reject()

  resolveBranchDeferred : ->
    @branchDeferred.resolve()
      

  addNode : (position, type) ->
    unless @lastRadius?
      @lastRadius = 10 * @scaleInfo.baseVoxel
      if @activeNode? then @lastRadius = @activeNode.radius
    point = new TracePoint(type, @idCount++, position, @lastRadius)
    @activeTree.nodes.push(point)
    if @activeNode
      @activeNode.appendNext(point)
      point.appendNext(@activeNode)
    @activeNode = point
    @lastActiveNodeId = @activeNode.id
    @doubleBranchPop = false
    @push()
    
    @trigger("newNode")


  getActiveNode : ->
    @activeNode

  getActiveNodeId : ->
    @lastActiveNodeId

  getActiveNodePos : ->
    if @activeNode then @activeNode.pos else null

  getActiveNodeType : ->
    if @activeNode then @activeNode.type else null

  getActiveNodeRadius : ->
    if @activeNode then @activeNode.size else null

  getActiveTreeId : ->
    if @activeTree then @activeTree.treeId else null


  getNode : (id) ->
    for tree in @trees
      for node in tree.nodes
        if node.id == id then return node
    return null
    

  setActiveNodeRadius : (radius) ->
    # make sure radius is within bounds
    radius = Math.min(MAX_RADIUS * @scaleInfo.baseVoxel, radius)
    radius = Math.max(MIN_RADIUS * @scaleInfo.baseVoxel, radius)
    if @activeNode
      @activeNode.radius = radius
      @lastRadius = radius
    @push()

    @trigger("newActiveNodeRadius", radius)


  setActiveNode : (id) ->

    for tree in @trees
      for node in tree.nodes
        if node.id == id
          @activeNode = node
          @lastActiveNodeId = @activeNode.id
          @activeTree = tree
          break
    @push()

    @trigger("newActiveNode")


  setComment : (commentText) ->
    if(@activeNode?)
      # remove any existing comments for that node
      for i in [0...@comments.length]
        if(@comments[i].node == @activeNode.id)
          @comments.splice(i, 1)
          break
      @comments.push({node: @activeNode.id, content: commentText})

  getComment : (nodeID) ->
    unless nodeID? then nodeID = @activeNode.id if @activeNode?
    for comment in @comments
      if comment.node == nodeID then return comment.content
    return ""

  deleteComment : (nodeID) ->
    for i in [0...@comments.length]
      if(@comments[i].node == nodeID)
        @comments.splice(i, 1)
        return

  nextCommentNodeID : (forward) ->
    unless @activeNode?
      if @comments.length > 0 then return @comments[0].node

    if @comments.length == 0
      return null

    for i in [0...@comments.length]
      if @comments[i].node == @activeNode.id
        if forward
          return @comments[(i + 1) % @comments.length].node
        else
          if i == 0 then return @comments[@comments.length - 1].node
          else
            return @comments[(i - 1)].node

    return @comments[0].node


  setActiveTree : (id) ->
    for tree in @trees
      if tree.treeId == id
        @activeTree = tree
        break
    if @activeTree.nodes.length == 0
      @activeNode = null
    else
      @activeNode = @activeTree.nodes[0]
      @lastActiveNodeId = @activeNode.id
    @push()

    @trigger("newActiveTree")

  getNewTreeColor : ->
    switch @treeIdCount
      when 1 then return 0xFF0000
      when 2 then return 0x00FF00
      when 3 then return 0x0000FF
      when 4 then return 0xFF00FF
      when 5 then return 0xFFFF00
      else  
        new THREE.Color().setHSV(Math.random(), 1, 1).getHex()

  createNewTree : ->
    tree = new TraceTree(@treeIdCount++, @getNewTreeColor())
    @trees.push(tree)
    @activeTree = tree
    @activeNode = null
    @push()

    @trigger("newTree", tree.treeId, tree.color)

  deleteActiveNode : ->
    unless @activeNode?
      return

    @deleteComment(@activeNode.id)
    for neighbor in @activeNode.neighbors
      neighbor.removeNeighbor(@activeNode.id)
    @activeTree.removeNode(@activeNode.id)

    deletedNode = @activeNode
    
    if @activeNode.neighbors.length > 1
      # Need to split tree
      newTrees = []
      for i in [0...@activeNode.neighbors.length]
        unless i == 0
          # create new tree for all neighbors, except the first
          @createNewTree()

        @activeTree.nodes = []
        @getNodeListForRoot(@activeTree.nodes, deletedNode.neighbors[i])
        @activeNode = deletedNode.neighbors[i]
        newTrees.push(@activeTree)

      @trigger("reloadTrees", newTrees)
        
    else if @activeNode.neighbors.length == 1
      # no children, so just remove it.
      @trigger("deleteActiveNode", deletedNode)
      @activeNode = deletedNode.neighbors[0]
    else
      @deleteActiveTree()
    
    @push()

  deleteActiveTree : ->
    # There should always be an active Tree
    # Find index of activeTree
    for i in [0..@trees.length]
      if @trees[i].treeId == @activeTree.treeId
        index = i
        break
    @trees.splice(index, 1)
    # remove comments of all nodes inside that tree
    for node in @activeTree.nodes
      @deleteComment(node.id)
    # Because we always want an active tree, check if we need
    # to create one.
    if @trees.length == 0
      @createNewTree()
    else
      # just set the last tree to be the active one
      @setActiveTree(@trees[@trees.length - 1].treeId)
    @push()

    @trigger("deleteActiveTree", index)

  getTree : (id) ->
    unless id
      return @activeTree
    for tree in @trees
      if tree.treeId == id
        return tree
    return null

  getTrees : ->
    @trees

  # returns a list of nodes that are connected to the parent
  #
  # ASSUMPTION:    we are dealing with a tree, circles would
  #                break this algorithm
  getNodeListForRoot : (result, root, previous) ->
    result.push(root)
    next = root.getNext(previous)
    while next?
      if _.isArray(next)
        for neighbor in next
          @getNodeListForRoot(result, neighbor, root)
      else
        result.push(next)
        newNext = next.getNext(root)
        root = next
        next = newNext


  getNodeListOfAllTrees : ->
    result = []
    for tree in @trees
      result = result.concat(tree.nodes)
    return result

  rendered : ->
    @trigger("rendered")

  # Helper method used in initialization
  findNodeInList : (list, id) ->
    for node in list
      if node.id == id
        return node
    return null
