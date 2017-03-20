/**
 * right_menu_view.js
 * @flow
 */

import React from "react";
import { Tabs } from "antd";
import Store from "oxalis/store";
import type Model from "oxalis/model";
import CommentTabView from "oxalis/view/skeletontracing/right-menu/comment_tab/comment_tab_view";
import AbstractTreeTabView from "oxalis/view/skeletontracing/right-menu/abstract_tree_tab_view";
import TreesTabView from "oxalis/view/skeletontracing/right-menu/trees_tab_view";
import DatasetInfoTabView from "oxalis/view/viewmode/right-menu/dataset_info_tab_view";

const TabPane = Tabs.TabPane;

type RightMenuViewProps = {
  oldModel: Model,
  isPublicViewMode: boolean,
};

class ReactBackboneWrapper extends React.Component {

  onRefMounted = (domElement) => {
    if (domElement) {
      this.props.backboneView.setElement(domElement);
      this.props.backboneView.render();
    }
  }

  render() {
    return <div ref={this.onRefMounted} />;
  }
}

class RightMenuView extends React.PureComponent {
  props: RightMenuViewProps;

  render() {
    return (
      <Tabs destroyInactiveTabPane defaultActiveKey="1">
        <TabPane tab="Info" key="1"><DatasetInfoTabView oldModel={this.props.oldModel} /></TabPane>
        <TabPane tab="Tree Viewer" key="2"></TabPane>
        <TabPane tab="Trees" key="3"><TreesTabView /></TabPane>
        <TabPane tab="Comments" key="4"><CommentTabView /></TabPane>
      </Tabs>
    );
  }
}
export default RightMenuView;
