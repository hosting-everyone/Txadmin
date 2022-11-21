import React from "react";
import { Box, Collapse, styled, Typography } from "@mui/material";
import { PageTabs} from "@nui/src/components/misc/PageTabs";
import { txAdminMenuPage, usePageValue } from "@nui/src/state/page.state";
import { MainPageList } from "@nui/src/components/MainPage/MainPageList";
import { useServerCtxValue } from "@nui/src/state/server.state";

const TxAdminLogo: React.FC = () => (
  <Box my={1} display="flex" justifyContent="center">
    <img src="images/txadmin.png" alt="txAdmin logo" />
  </Box>
);

const StyledRoot = styled(Box)(({ theme }) => ({
  height: "fit-content",
  background: theme.palette.background.default,
  width: 325,
  borderRadius: 15,
  display: "flex",
  flexDirection: "column",
  userSelect: "none",
}));

export const MenuRootContent: React.FC = React.memo(() => {
  const serverCtx = useServerCtxValue();
  const curPage = usePageValue()
  const padSize = Math.max(0, 9 - serverCtx.txAdminVersion.length);
  const versionPad = "\u0020\u205F".repeat(padSize);

  return (
    <StyledRoot p={2} pb={1}>
      <TxAdminLogo />
      <Typography
        color="textSecondary"
        style={{
          fontWeight: 500,
          marginTop: -20,
          textAlign: "right",
          fontSize: 12,
        }}
      >
        v{serverCtx.txAdminVersion}
        {versionPad}
      </Typography>
      <PageTabs />
      <Collapse
        in={curPage === txAdminMenuPage.Main}
        unmountOnExit
        mountOnEnter
      >
        <MainPageList />
      </Collapse>
    </StyledRoot>)
});