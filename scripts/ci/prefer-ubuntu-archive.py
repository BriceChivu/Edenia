"""Prefer the runner's existing Ubuntu archive without replacing APT sources."""

from pathlib import Path


DEFAULT_MIRRORS = Path('/etc/apt/apt-mirrors.txt')
ARCHIVES = {'http://archive.ubuntu.com/ubuntu', 'https://archive.ubuntu.com/ubuntu'}
AZURE = {'http://azure.archive.ubuntu.com/ubuntu', 'https://azure.archive.ubuntu.com/ubuntu'}


def prefer_ubuntu_archive(mirrors: Path = DEFAULT_MIRRORS) -> bool:
    """Return whether an existing mirror pair's priority metadata changed."""
    if not mirrors.is_file():
        return False
    original = mirrors.read_text()
    lines = original.splitlines()

    def host(line):
        return line.split('\t', 1)[0].rstrip('/')

    if not (any(host(line) in ARCHIVES for line in lines)
            and any(host(line) in AZURE for line in lines)):
        return False

    preferred = []
    for line in lines:
        uri, _, metadata = line.partition('\t')
        priority = 1 if host(line) in ARCHIVES else 2 if host(line) in AZURE else None
        if priority is not None:
            tags = [tag for tag in metadata.split() if not tag.startswith('priority:')]
            line = uri + '\t' + ' '.join([f'priority:{priority}', *tags])
        preferred.append(line)
    updated = '\n'.join(preferred) + '\n'
    if updated == original:
        return False
    mirrors.write_text(updated)
    return True


if __name__ == '__main__':
    if prefer_ubuntu_archive():
        print('Preferred the existing official Ubuntu archive ahead of the Azure mirror.')
    else:
        print('APT mirror priorities unchanged.')
    if DEFAULT_MIRRORS.is_file():
        print(DEFAULT_MIRRORS.read_text(), end='')
