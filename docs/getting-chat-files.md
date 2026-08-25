# Getting the correct group-chat file

The MVP accepts one complete export for the conversation you want to analyze.

## iMessage

Upload the SQLite database, commonly named `chat.db` or using a `.sqlite`/`.db` extension. If it contains multiple conversations, the app will show a picker so you can choose the group chat before analysis. The database needs message and sender/handle data. Screenshots, PDFs, a media-only folder, or an entire phone backup are not valid inputs.

## Instagram

Request your information from Instagram in JSON format. In the downloaded Messages/Chats folder, select the JSON file belonging to the group thread, commonly `message_1.json`. It should contain the complete messages array. This MVP does not yet merge multiple split files automatically.

## CSV

Provide `timestamp`, `sender`, and `text` columns. Optional columns include `media`, `media_type`, `attachment`, and `reaction`. Keep the original file extension and make sure the file belongs to the intended conversation.
