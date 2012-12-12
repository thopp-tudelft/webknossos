### define ###

class FilterSegmentsByDistance

  DESCRIPTION : "Returns all segments that are farer or nearer than the given distance"

  PARAMETER : 
    input: 
      rgba: 'Uint8Array'
      segmentation: 'Uint8Array'
      segments: '[]'
    width: 'int'
    height: 'int'
    distance : ''
    comparisonMode : 'string' # e.g. '<='


  constructor : () ->



  execute : (options) ->

    { input: { rgba, segmentations, segments }, width, height, distance, comparisonMode } = options

    values = []
    compareFunc = new Function("a","b", "return a #{comparisonMode} b;")

    for segment in segments
      if compareFunc(segment.distance, distance)
        values.push segment.value

    for h in [0...height] by 1
      for w in [0...width] by 1
        i = h * height + w
        s = segmentations[i]

        if _.contains(values, s) is false
          rgba[i * 4 + 3] = 0

    rgba