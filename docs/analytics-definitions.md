# Analytics definitions

The Humor Index is a reaction-only funniness score. Each native positive reaction on a message contributes one equal unit within that conversation; the system does not assume that a laugh is more meaningful than a love, like, applause, or fire reaction. A message’s reaction signal is the number of distinct positive reactors divided by the number of other participants, capped at 1. A participant’s average reaction impact is the average reaction signal across their eligible messages multiplied by 100. The displayed Comedian ranking blends 65% average reaction impact with 35% log-scaled total positive reaction volume. Replies, reply timing, and message wording do not affect either humor component.

If a chat export contains no native reaction records, the score will correctly show zero and the report will say that no reactions were detected. This is different from “people reached,” which has been removed because it was ambiguous and was not needed for the reaction-based score.

Reply timing and reply classification may support separate conversation metrics, but they are deliberately excluded from the Humor Index. Humor never receives a boost from a reply, a reply’s wording, or a reply’s timing.

All titles include sample sizes and should be treated as entertainment, not psychological or demographic profiling.

The Emoji Addict, Media Spammer, and Conversation Starter titles use a blended score: 65% normalized intensity (items or starts per 100 messages) and 35% log-scaled total volume. This gives active participants credit for doing something repeatedly while preventing raw message count from completely overpowering the rate.
