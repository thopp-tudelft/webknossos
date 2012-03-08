define(
	[
		"model",
		"view",
		"geometry_factory",
		"mouse"
	]
	(Model, View, GeometryFactory, Mouse) ->

		Controller =
			mouse = null
			cvs = null

			initialize : (cannvas) ->
				cvs = cannvas
				
				Model.Route.initialize().done (matrix) =>
						
					View.setCam(matrix)

					GeometryFactory.createMesh("coordinateAxes", "mesh").done (mesh) ->
						View.addGeometry mesh
						
					GeometryFactory.createMesh("crosshair", "mesh").done (mesh) -> 
						View.addGeometry mesh

					GeometryFactory.createTrianglesplane(128, 0, "trianglesplane").done (trianglesplane) ->
						View.addGeometry trianglesplane		


			initMouse : ->
				mouse = new Mouse cvs

				mouse.bindX View.yawDistance()
				mouse.bindY View.pitchDistance()


			initKeyboard : ->
			
		  
		  # keyboard events
)
