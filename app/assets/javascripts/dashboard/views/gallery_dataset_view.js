// flow
/* eslint-disable jsx-a11y/href-no-hash */
import * as React from "react";
import { Row, Col, Modal, Card } from "antd";
import Utils from "libs/utils";
import Markdown from "react-remarkable";
import TemplateHelpers from "libs/template_helpers";
import app from "app";
import type { DatasetType } from "dashboard/views/dataset_view";

const padding = 16;

type Props = {
  datasets: Array<DatasetType>,
  searchQuery: string,
};

type State = {
  contentType: string,
};

class GalleryDatasetView extends React.PureComponent<Props, State> {
  form: any;

  static defaultProps = {
    searchQuery: "",
  };

  state = {
    contentType: "",
  };

  handleSkeletonTraceClick = (event: Event) => {
    this.submitForm("skeletonTracing", event);
  };

  handleVolumeTraceClick = (event: Event) => {
    this.submitForm("volumeTracing", event);
  };

  submitForm(type: string, event: Event) {
    event.preventDefault();

    if (app.currentUser != null) {
      this.setState({ contentType: type }, () => {
        this.form.submit();
      });
    } else {
      const loginNotice = `For dataset annotation, please log in or create an account. For dataset viewing, no account is required.
        Do you wish to sign up now?`;
      Modal.confirm({
        content: loginNotice,
        onOk: () => {
          window.location.href = "/auth/register";
        },
      });
    }
  }

  renderCard(dataset: DatasetType) {
    let description;
    if (dataset.description) {
      description = (
        <Markdown
          source={dataset.description}
          options={{ html: false, breaks: true, linkify: true }}
        />
      );
    } else {
      description = dataset.hasSegmentation
        ? <p>Original data and segmentation</p>
        : <p>Original data</p>;
    }

    return (
      <Card
        bodyStyle={{ padding: 0 }}
        style={{ backgroundImage: `url(${dataset.thumbnailURL})` }}
        className="spotlight-item-card"
      >
        <div className="dataset-thumbnail-buttons">
          <a href={`/datasets/${dataset.name}/view`} title="View dataset">
            <img src="/assets/images/eye.svg" alt="Eye" />
          </a>
          <a href="#" title="Create skeleton tracing" onClick={this.handleSkeletonTraceClick}>
            <img src="/assets/images/skeleton.svg" alt="Skeleton" />
          </a>
          {dataset.dataStore.typ !== "ndstore"
            ? <a href="#" title="Create volume tracing" onClick={this.handleVolumeTraceClick}>
                <img src="/assets/images/volume.svg" alt="Volume" />
              </a>
            : null}
        </div>
        <div className="dataset-description">
          <h3>
            {dataset.name}
          </h3>
          <p>
            Scale: {TemplateHelpers.formatScale(dataset.dataSource.scale)}
          </p>
          {description}
        </div>

        <form
          action={jsRoutes.controllers.AnnotationController.createExplorational().url}
          method="POST"
          ref={form => {
            this.form = form;
          }}
        >
          <input type="hidden" name="dataSetName" value={dataset.name} />
          <input type="hidden" name="contentType" value={this.state.contentType} />
        </form>
      </Card>
    );
  }

  render() {
    return (
      <Row gutter={padding}>
        {Utils.filterWithSearchQueryAND(
          this.props.datasets.filter(ds => ds.isActive),
          ["name", "owningTeam", "description"],
          this.props.searchQuery,
        ).map(ds =>
          <Col span={6} key={ds.name} style={{ paddingBottom: padding }}>
            {this.renderCard(ds)}
          </Col>,
        )}
      </Row>
    );
  }
}

export default GalleryDatasetView;