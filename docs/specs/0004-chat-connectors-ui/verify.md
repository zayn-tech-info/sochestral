# Verify Sochestral chat workspace and connectors

1. Sign in through `/login` and confirm a valid session returns to the requested relative app path.
2. Create a conversation, send another message, change conversations while a request is pending, load older history, and delete an idle conversation.
3. Confirm tool cards show only persisted safe summaries and no MCP token, OAuth token, prompt, or raw provider error.
4. Open `/app/settings/connectors` and confirm Threads, LinkedIn Personal, and Instagram always appear.
5. Start each connect action and confirm only the expected provider host opens in the same tab.
6. Simulate a SocialMCP outage and confirm the page says unavailable without changing an account to not connected.
7. Complete an OAuth callback and confirm the browser returns with safe query values, then refreshes live account status.
8. Test wide, tablet, and phone layouts with keyboard navigation and reduced motion enabled.
9. Search visible web copy and confirm the product name is Sochestral.
10. Confirm the orchestration allowlist and forced dry run behavior did not change.
