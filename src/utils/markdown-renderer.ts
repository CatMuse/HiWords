import { App, MarkdownRenderer, Component } from 'obsidian';

export async function renderMarkdownToElement(
    app: App,
    markdown: string,
    containerEl: HTMLElement,
    sourcePath: string = ''
): Promise<Component> {
    const component = new Component();
    component.load();

    try {
        await MarkdownRenderer.render(
            app,
            markdown,
            containerEl,
            sourcePath,
            component
        );
    } catch (error) {
        console.error('Failed to render markdown:', error);
        containerEl.textContent = markdown;
    }

    return component;
}

export function renderMarkdownToHTML(markdown: string): string {
    const lines = markdown.split('\n');
    let html = '';
    
    for (const line of lines) {
        if (line.startsWith('**') && line.endsWith('**')) {
            const content = line.slice(2, -2);
            html += `<h3>${escapeHtml(content)}</h3>`;
        } else if (line.startsWith('## ')) {
            html += `<h2>${escapeHtml(line.slice(3))}</h2>`;
        } else if (line.startsWith('# ')) {
            html += `<h1>${escapeHtml(line.slice(2))}</h1>`;
        } else if (line.match(/^\d+\.\s/)) {
            html += `<p>${escapeHtml(line)}</p>`;
        } else if (line.trim().startsWith('-')) {
            const content = line.trim().slice(1).trim();
            if (content.startsWith('*') && content.includes('*', 1)) {
                const parts = content.split('*');
                html += `<p class="hiwords-example">• <em>${escapeHtml(parts[1])}</em></p>`;
            } else {
                html += `<p class="hiwords-detail">• ${escapeHtml(content)}</p>`;
            }
        } else if (line.trim()) {
            html += `<p>${escapeHtml(line)}</p>`;
        }
    }
    
    return html;
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
