import React from "react";
import {
  Box,
  makeStyles,
  Theme,
  Typography,
  useTheme,
} from "@material-ui/core";
import { usePlayerDetailsValue } from "../../../state/playerDetails.state";
import { useTranslate } from "react-polyglot";


// TODO: Make the styling on this nicer
const NoHistoryBox = () => (
  <Box>
    <Typography color="textSecondary">
      No history found for this player
    </Typography>
  </Box>
);

const useStyles = makeStyles((theme: Theme) => ({
  historyItem: {
    background: theme.palette.background.paper,
    padding: "10px 10px",
    marginBottom: 7,
    display: "flex",
    justifyContent: "space-between",
  },
}));

const DialogHistoryView: React.FC = () => {
  const classes = useStyles();
  const player = usePlayerDetailsValue();
  const theme = useTheme();
  const t = useTranslate();

  const playerActionHistory = player?.actionHistory;

  const actionTypes = {
    WARN: {
      title: t("nui_menu.player_modal.ban.action_types.warn"),
      color: "#f1c40f",
    },
    "WARN-REVOKED": {
      title: t("nui_menu.player_modal.ban.action_types.warn_revoked"),
      color: "gray",
    },
    KICK: {
      title: t("nui_menu.player_modal.ban.action_types.kick"),
      color: "#e67e22",
    },
    BAN: {
      title: t("nui_menu.player_modal.ban.action_types.ban"),
      color: "#c2293e",
    },
    "BAN-REVOKED": {
      title: t("nui_menu.player_modal.ban.action_types.ban_revoked"),
      color: "gray",
    },
    WHITELIST: {
      title: t("nui_menu.player_modal.ban.action_types.whitelist"),
      color: "#c2293e",
    },
    "WHITELIST-REVOKED": {
      title: t("nui_menu.player_modal.ban.action_types.whitelist_revoked"),
      color: "gray",
    },
  };

  return (
    <Box p={2} height="100%" display="flex" flexDirection="column">
      <Typography variant="h6" style={{ paddingBottom: 5 }}>
        Related History
      </Typography>
      <Box flexGrow={1} overflow="auto" pr={1}>
        {playerActionHistory?.length ? (
          playerActionHistory.map((h, index) => (
            <Box
              className={classes.historyItem}
              borderLeft={`solid 2px ${actionTypes[h.action].color}`}
              key={index}
            >
              <Box>
                <Typography>
                  {h.author} {actionTypes[h.action].title} {player.name}
                </Typography>
                <Typography style={{ color: theme.palette.text.secondary }}>
                  {h.reason}
                </Typography>
              </Box>
              <Box>
                <Typography>{h.date}</Typography>
              </Box>
            </Box>
          ))
        ) : (
          <NoHistoryBox />
        )}
      </Box>
    </Box>
  );
};

export default DialogHistoryView;
