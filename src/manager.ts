import { addons, types } from "storybook/internal/manager-api";
import { ADDON_ID, PANEL_ID } from "./constants";
import { Panel } from "./components/Panel";

addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: "Loracle",
    render: Panel,
  });
});
