# Analytics definitions

The Main Character is a reaction-only attention score. Each native reaction on a message — positive, negative, or neutral — contributes one equal unit within that conversation; the system does not assume that a laugh is more meaningful than a love, like, dislike, or question. A message’s reaction signal is the number of distinct reactors divided by the number of other participants, capped at 1. A participant’s average reaction impact is the average reaction signal across their eligible messages multiplied by 100. The displayed Main Character ranking blends 65% average reaction impact with 35% log-scaled total reaction volume. Replies, reply timing, and message wording do not affect either component.

If a chat export contains no native reaction records, the score will correctly show zero and the report will say that no reactions were detected. This is different from “people reached,” which has been removed because it was ambiguous and was not needed for the reaction-based score.

Reply timing and reply classification may support separate conversation metrics, but they are deliberately excluded from the Main Character ranking. It never receives a boost from a reply, a reply’s wording, or a reply’s timing.

All titles include sample sizes and should be treated as entertainment, not psychological or demographic profiling.

The Emoji Addict, Media Spammer, and Conversation Starter titles use a blended score: 65% normalized intensity (items or starts per 100 messages) and 35% log-scaled total volume. This gives active participants credit for doing something repeatedly while preventing raw message count from completely overpowering the rate.

## Additional superlatives

All of the following metrics run on the selected conversation. A future multi-conversation report can aggregate the same counters by conversation ID, but the current product never silently combines unrelated chats.

### The Ghost

The Ghost is the participant with the fewest total eligible messages in the selected conversation. Eligible messages exclude deleted and system records. The leaderboard includes known participants with zero messages, so a person who appears in the export's participant or reaction roster can still be identified as the quietest participant. The detail view shows total messages, share of the conversation, and active days.

### The Time Traveler

The Time Traveler is a participant who returns after the group has gone quiet. A qualifying event is either:

- an explicit reply reference arriving at least four hours after the referenced message; or
- when no reply reference exists, a message from a different participant arriving at least four hours after the previous message.

The score is 70% normalized count of late returns and 30% log-scaled trimmed average delay. The trimmed average drops the bottom and top quartiles of per-event delays before averaging, so a single multi-day outlier does not dominate the metric. The detail view also reports the longest delay, intervening messages, and how many late events had explicit reply metadata. This makes a person who repeatedly returns late rank above someone who was late once for an entire day.

### The Grammar Police

The Grammar Police ranking measures the density of formal writing signals rather than raw message volume. Emoji-only, media-only, and empty messages are excluded. Each eligible text message contributes:

- 40% proper punctuation quality, including sentence-ending punctuation and standard punctuation density;
- 35% capitalization of sentence starts; and
- 25% explicit formal markers such as “please,” “thank you,” “however,” “therefore,” or “could you.”

The displayed score is the average of those message-level scores. A participant needs at least five eligible text messages to win the title, preventing a single unusually formal message from deciding the result. The full leaderboard still shows everyone and their sample size.

These titles are entertainment-oriented descriptions of message behavior, not psychological or demographic conclusions. Sparse or incomplete exports should display the sample size and may omit a winner when the minimum evidence threshold is not met.
