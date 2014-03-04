### define
underscore : _
backbone : backbone
./annotation_model : AnnotationModel
###

class AnnotationCollection extends Backbone.Collection

  model : AnnotationModel

  constructor : (taskId) ->
    @url = "/admin/tasks/#{taskId}/annotations"
    super()


