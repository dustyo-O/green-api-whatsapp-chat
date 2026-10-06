// @layer: integration
// @spec: 004-receiving-replies
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  API_URL,
  queue,
  ready,
  received,
  server,
  setupGreenApiServer,
} from "../test/green-api-server";
import { textMessage } from "./notification.fixtures";

setupGreenApiServer();

const ID = "7103123456";

async function openSignedIn() {
  localStorage.setItem(
    "green-api-chat:session",
    JSON.stringify({
      state: {
        credentials: {
          idInstance: ID,
          apiTokenInstance: "faketoken",
          apiUrl: API_URL,
          customApiUrl: false,
        },
      },
      version: 1,
    }),
  );
  server.use(...ready());
  document.body.innerHTML = '<div id="root"></div>';
  vi.resetModules();
  await act(async () => {
    await import("../main");
  });
  await screen.findByText(`Инстанс ${ID}`);
}

describe("MainScreen", () => {
  // @regression — tech §2.4: receiving runs exactly while signed in
  it("receives while signed in and stops on «Выйти»", async () => {
    queue({ receiptId: 1, body: textMessage });
    await openSignedIn();

    await vi.waitFor(() => {
      expect(localStorage.getItem(`green-api-chat:chats:${ID}`)).toContain(
        "Привет-привет",
      );
    });
    const polls = received.length;
    const remove = vi.spyOn(window, "removeEventListener");

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Выйти" }));

    // The loop's last step: it ended, rather than hanging on its poll.
    await vi.waitFor(() => {
      expect(remove).toHaveBeenCalledWith("online", expect.any(Function));
    });
    expect(received).toHaveLength(polls);
    expect(localStorage.getItem(`green-api-chat:chats:${ID}`)).toBeNull();
  });
});
