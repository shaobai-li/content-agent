from app.utils.article_parser import extract_article_content


class TestExtractArticleContent:
    def test_extracts_article_content(self):
        text = "prefix <article>Hello world</article> suffix"

        assert extract_article_content(text) == "Hello world"

    def test_strips_surrounding_whitespace_inside_article(self):
        text = "<article>\n\n  Draft content  \n\n</article>"

        assert extract_article_content(text) == "Draft content"

    def test_extracts_multiline_content(self):
        text = "<article># Title\n\nParagraph one.\nParagraph two.</article>"

        assert extract_article_content(text) == "# Title\n\nParagraph one.\nParagraph two."

    def test_returns_first_article_when_multiple_exist(self):
        text = "<article>first</article><article>second</article>"

        assert extract_article_content(text) == "first"

    def test_empty_article_returns_empty_string(self):
        assert extract_article_content("<article></article>") == ""

    def test_returns_none_when_article_tag_missing(self):
        assert extract_article_content("plain text") is None

    def test_returns_none_when_closing_tag_missing(self):
        assert extract_article_content("<article>unfinished") is None

    def test_returns_none_when_opening_tag_missing(self):
        assert extract_article_content("unfinished</article>") is None
