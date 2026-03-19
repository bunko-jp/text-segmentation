/**
 * @file Text fixtures for segmentation tests
 */

export type SegmentationFixture = {
  name: string;
  description: string;
  input: string;
};

export const JAPANESE_ARTICLE_FIXTURE: SegmentationFixture = {
  name: "japanese-article",
  description: "Japanese article with headings and sections",
  input: `はじめに

本稿では、テキスト短縮技術について詳細に解説します。テキスト短縮は、文書の意味を完全に保持しながら文字数を大幅に削減する重要な技術です。

技術概要

テキスト短縮には主に2つのアプローチがあります。第一に、冗長な表現や重複する内容の削除です。第二に、より簡潔な言い換えによる効率的な圧縮です。

まとめ

これらの技術を適切に組み合わせることで、非常に効果的な短縮が実現可能になります。`,
};

export const RASHOMON_EXCERPT_FIXTURE: SegmentationFixture = {
  name: "rashomon-excerpt",
  description: "Excerpt from Rashomon (Akutagawa Ryunosuke)",
  input: `羅生門

ある日の暮方の事である。一人の下人が、羅生門の下で雨やみを待っていた。

広い門の下には、この男のほかに誰もいない。ただ、所々丹塗の剥げた、大きな円柱に、蟋蟀が一匹とまっている。羅生門が、朱雀大路にある以上は、この男のほかにも、雨やみをする市女笠や揉烏帽子が、もう二三人はありそうなものである。`,
};

export const MULTI_PARAGRAPH_FIXTURE: SegmentationFixture = {
  name: "multi-paragraph",
  description: "Multiple paragraphs without explicit headings",
  input: `The first paragraph discusses the importance of clear communication. It emphasizes how precise language can prevent misunderstandings.

The second paragraph explores various techniques for improving clarity. These include using simple words, short sentences, and concrete examples.

Finally, the third paragraph summarizes the key points and provides actionable recommendations for writers.`,
};

export const SINGLE_PARAGRAPH_FIXTURE: SegmentationFixture = {
  name: "single-paragraph",
  description: "Text that should be a single paragraph",
  input: `This is a simple paragraph without any section breaks or headings. It continues as a single unit of text that should not be split into multiple segments.`,
};
