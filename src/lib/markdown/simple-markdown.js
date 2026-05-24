export function tokenizeBoldMarkdown(text) {
    const tokens = []
    let cursor = 0

    while (cursor < text.length) {
        const start = text.indexOf('**', cursor)
        if (start === -1) {
            tokens.push({ text: text.slice(cursor), bold: false })
            break
        }

        const end = text.indexOf('**', start + 2)
        if (end === -1) {
            tokens.push({ text: text.slice(cursor), bold: false })
            break
        }

        if (start > cursor) {
            tokens.push({ text: text.slice(cursor, start), bold: false })
        }

        const boldText = text.slice(start + 2, end)
        if (boldText.length > 0) {
            tokens.push({ text: boldText, bold: true })
        }

        cursor = end + 2
    }

    return tokens.filter(token => token.text.length > 0)
}

export function getMarkdownLineKind(line) {
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/)
    if (bulletMatch) {
        return {
            type: 'bullet',
            content: bulletMatch[1],
        }
    }

    const numberedMatch = line.match(/^\s*(\d+\.)\s+(.+)$/)
    if (numberedMatch) {
        return {
            type: 'numbered',
            marker: numberedMatch[1],
            content: numberedMatch[2],
        }
    }

    return {
        type: 'paragraph',
        content: line,
    }
}
