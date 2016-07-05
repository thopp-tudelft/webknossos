class TraceTree

  constructor : (@treeId, @color, @name, @timestamp, @comments=[], @branchpoints=[]) ->

    @nodes = []


  removeNode : (id) ->

    @removeCommentWithNodeId(id)

    for i in [0...@nodes.length]
      if @nodes[i].id == id
        @nodes.splice(i, 1)
        return


  removeCommentWithNodeId : (id) ->

    for i in [0...@comments.length]
      if @comments[i].node == id
        @comments.splice(i, 1)
        return


  buildTree : ->

    # Use node with minimal ID as root
    for node in @nodes

      # Initialize Cyclic tree detection
      node._seen = false

      # define root as the node with smallest id
      if root?
        if root.id > node.id then root = node
      else
        root = node

    if root?
      root.buildTree()

    return root

module.exports = TraceTree
