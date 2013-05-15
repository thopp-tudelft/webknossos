### define
worker!director_client.worker.min.js : Worker
underscore : _
jquery : $
routes : routes
###

class StackViewer

  constructor : ->

    $(".level-version").each ->

      $levelVersion = $(this)

      shiftKeyPressed = false
      $(document).on 
        "keydown" : (event) ->
          shiftKeyPressed = event.shiftKey
          return

        "keyup" : (event) ->
          if shiftKeyPressed and (event.which == 16 or event.which == 91)
            shiftKeyPressed = false
          return

      $(".level-version .stack-buttons input[type=checkbox]").on "change", ->

        if $(this).parents(".level-version").first()[0] != $levelVersion[0]
          $levelVersion.data("select-row-last", null)


      $levelVersion.on "change", ".stack-buttons input[type=checkbox]", ->

        $stack = $(this).parents(".stack").first()

        if (selectRowLast = $levelVersion.data("select-row-last")) and shiftKeyPressed
          index = $stack.prevAll().length
          rows = if index < selectRowLast.index
            $stack.nextUntil(selectRowLast.el)
          else
            $stack.prevUntil(selectRowLast.el)

          rows.find(".stack-buttons input[type=checkbox]").prop("checked", this.checked)

          $levelVersion.data("select-row-last", null)
        else
          
          $levelVersion.data("select-row-last", { el : $stack, index : $stack.prevAll().length })

        return

      $levelVersion.on "click", "a[href=#bulk-load]", (event) ->

        event.preventDefault()

        $levelVersion.find(".stack:has(.stack-buttons input[type=checkbox]:checked) .stack-display a").click()

        return




    $(".stack-display a").click (event) =>

      event.preventDefault()
      $el = $(event.currentTarget).parent()

      $el.html("<div class=\"loading-indicator\"><i class=\"icon-refresh icon-spin\"></i></div>")

      levelName = $el.parents("#stack-list").data("levelname")
      stackUrl = event.currentTarget.href
      @loadStack(stackUrl).then( 

        (stack) => 

          $canvas = $("<canvas>").prop(width : stack.meta.width, height : stack.meta.height)
          context = $canvas[0].getContext("2d")
          imageData = context.createImageData(stack.meta.width, stack.meta.height)

          $slider = $("<input>", type : "range", min : 0, max : stack.meta.length - 1, value : 0)

          prettyMeta = JSON.stringify(stack.meta, null, " ").replace(/\[(\s+(\d+,?)\n)+\s+\]/g, (a) -> a.replace(/\n\s+/g, ""))

          $el
            .html("")
            .append($canvas, $slider)

          $slider
            .on("change", (event) ->
              imageData.data.set(stack.croppedImages[event.target.value].data)
              context.putImageData(imageData, 0, 0)
            )
            .change()

        -> 
          $el.html("Error loading stack.")

      )


  loadStack : _.memoize (stackUrl) ->

    Worker.send( method : "loadStackData", args : [ stackUrl ] )


