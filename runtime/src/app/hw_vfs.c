#include "hw_vfs.h"

#include <stdio.h>
#include <string.h>

#include "hw_crc32.h"
#include "hw_pack.h"

#define MAX_PACKS 16

typedef struct mount {
    char path[1024];
    uint64_t base; /* where the pack starts in its file: 0, or its offset inside the player exe (single-file games) */
    hw_pack pack;
} mount;

struct hw_vfs {
    mount mounts[MAX_PACKS]; /* highest priority first */
    int count;
    char root[1024];         /* loose files, with a trailing slash; "" = none */
};

hw_vfs *hw_vfs_create(void) { return SDL_calloc(1, sizeof(hw_vfs)); }

void hw_vfs_destroy(hw_vfs *v)
{
    if (!v) return;
    for (int i = 0; i < v->count; i++) hw_pack_free(&v->mounts[i].pack);
    SDL_free(v);
}

int hw_vfs_pack_count(const hw_vfs *v) { return v->count; }

void hw_vfs_set_root(hw_vfs *v, const char *root)
{
    size_t n = strlen(root);
    snprintf(v->root, sizeof v->root, "%s%s", root, n == 0 || root[n - 1] == '/' || root[n - 1] == '\\' ? "" : "/");
}

/* Reads a pack's header and table of contents: the whole file, or `pack_size` bytes from `base` (0 = to the end). */
static bool open_pack(mount *mt, const char *path, uint64_t base, uint64_t pack_size, char *err, size_t cap)
{
    snprintf(mt->path, sizeof mt->path, "%s", path);
    mt->base = base;
    SDL_IOStream *io = SDL_IOFromFile(path, "rb");
    if (!io) {
        snprintf(err, cap, "can't open %s: %s", path, SDL_GetError());
        return false;
    }
    bool ok = false;
    Sint64 size = pack_size ? (Sint64)pack_size : SDL_GetIOSize(io);
    uint8_t head[HW_PACK_HEADER];
    hw_pack_header h;
    if (size < 0 || SDL_SeekIO(io, (Sint64)base, SDL_IO_SEEK_SET) < 0 || SDL_ReadIO(io, head, sizeof head) != sizeof head) {
        snprintf(err, cap, "%s is too short to be a pack", path);
    } else if (hw_pack_header_parse(&h, head, sizeof head, (uint64_t)size, err, cap)) {
        size_t toc_size = (size_t)((uint64_t)size - h.toc_offset);
        uint8_t *toc = SDL_malloc(toc_size ? toc_size : 1);
        if (toc && SDL_SeekIO(io, (Sint64)(base + h.toc_offset), SDL_IO_SEEK_SET) >= 0 && SDL_ReadIO(io, toc, toc_size) == toc_size) {
            ok = hw_pack_parse(&mt->pack, &h, toc, toc_size, (uint64_t)size, err, cap);
        } else if (!err[0]) {
            snprintf(err, cap, "can't read %s", path);
        }
        SDL_free(toc);
    }
    SDL_CloseIO(io);
    return ok;
}

bool hw_vfs_find_embedded(const char *exe, uint64_t *offset, uint64_t *size)
{
    SDL_IOStream *io = SDL_IOFromFile(exe, "rb");
    if (!io) return false;
    uint8_t head[4096], trailer[HW_PACK_TRAILER];
    Sint64 file_size = SDL_GetIOSize(io);
    size_t n = SDL_ReadIO(io, head, sizeof head);
    uint64_t end = file_size > 0 ? hw_pack_trailer_end(head, n, (uint64_t)file_size) : 0;
    bool ok = end >= HW_PACK_TRAILER && SDL_SeekIO(io, (Sint64)(end - HW_PACK_TRAILER), SDL_IO_SEEK_SET) >= 0 &&
              SDL_ReadIO(io, trailer, sizeof trailer) == sizeof trailer && hw_pack_trailer_parse(trailer, end, offset, size);
    SDL_CloseIO(io);
    return ok;
}

/* Mounts the base pack (`size` bytes at `at` in `path`; 0 = the whole file), then the patches in `dir`. */
static bool mount_base(hw_vfs *v, const char *path, uint64_t offset, uint64_t size, const char *dir, char *err, size_t cap)
{
    mount base;
    memset(&base, 0, sizeof base);
    if (!open_pack(&base, path, offset, size, err, cap)) return false;
    if (base.pack.h.priority != 0) {
        hw_pack_free(&base.pack);
        snprintf(err, cap, "%s is a patch, not a base pack", path);
        return false;
    }
    v->mounts[0] = base;
    v->count = 1;

    /* Patches: patch*.hwp beside it, for the same game, each with its own priority. */
    int n = 0;
    char pattern[] = "patch*.hwp";
    char **names = SDL_GlobDirectory(dir[0] ? dir : ".", pattern, SDL_GLOB_CASEINSENSITIVE, &n);
    for (int i = 0; names && i < n && v->count < MAX_PACKS; i++) {
        char ppath[1100], perr[200] = "";
        snprintf(ppath, sizeof ppath, "%s%s%s", dir, dir[0] && dir[strlen(dir) - 1] != '/' && dir[strlen(dir) - 1] != '\\' ? "/" : "", names[i]);
        mount m;
        memset(&m, 0, sizeof m);
        if (!open_pack(&m, ppath, 0, 0, perr, sizeof perr)) {
            SDL_Log("packs: skipped %s: %s", names[i], perr);
            continue;
        }
        bool clash = m.pack.h.game != base.pack.h.game || m.pack.h.priority == 0;
        for (int k = 0; k < v->count && !clash; k++) clash = v->mounts[k].pack.h.priority == m.pack.h.priority;
        if (clash) {
            SDL_Log("packs: skipped %s (another game's, or its priority %u is taken)", names[i], (unsigned)m.pack.h.priority);
            hw_pack_free(&m.pack);
            continue;
        }
        /* Keep the mounts sorted, highest priority first. */
        int at = v->count++;
        while (at > 0 && v->mounts[at - 1].pack.h.priority < m.pack.h.priority) {
            v->mounts[at] = v->mounts[at - 1];
            at--;
        }
        v->mounts[at] = m;
    }
    SDL_free(names);
    return true;
}

static void join(char *out, size_t cap, const char *dir, const char *name)
{
    size_t n = strlen(dir);
    snprintf(out, cap, "%s%s%s", dir, n && dir[n - 1] != '/' && dir[n - 1] != '\\' ? "/" : "", name);
}

bool hw_vfs_mount_packs(hw_vfs *v, const char *dir, char *err, size_t cap)
{
    err[0] = 0;
    char path[1100];
    join(path, sizeof path, dir, "data.hwp");
    return mount_base(v, path, 0, 0, dir, err, cap);
}

bool hw_vfs_mount_embedded(hw_vfs *v, const char *exe, const char *dir, char *err, size_t cap)
{
    err[0] = 0;
    uint64_t at = 0, size = 0;
    if (!hw_vfs_find_embedded(exe, &at, &size)) {
        snprintf(err, cap, "%s has no game inside it", exe);
        return false;
    }
    return mount_base(v, exe, at, size, dir, err, cap);
}

/* The pack entry that answers for `path`, or NULL (then *removed says whether a patch removed it). */
static const hw_pack_entry *find(const hw_vfs *v, const char *path, const mount **from, bool *removed)
{
    *removed = false;
    for (int i = 0; i < v->count; i++) {
        const hw_pack_entry *e = hw_pack_find(&v->mounts[i].pack, path);
        if (!e) continue;
        if (e->codec == HW_CODEC_REMOVED) {
            *removed = true;
            return NULL;
        }
        *from = &v->mounts[i];
        return e;
    }
    return NULL;
}

static bool loose_path(const hw_vfs *v, const char *path, char *out, size_t cap)
{
    if (!v->root[0]) return false;
    snprintf(out, cap, "%s%s", v->root, path);
    return SDL_GetPathInfo(out, NULL);
}

bool hw_vfs_exists(hw_vfs *v, const char *path)
{
    const mount *m;
    bool removed;
    if (find(v, path, &m, &removed)) return true;
    char full[1100];
    return !removed && loose_path(v, path, full, sizeof full);
}

/* ---- streams over pack entries ---- */

/* A stored entry: a window onto the pack file, un-obfuscated as it's read. */
typedef struct window {
    SDL_IOStream *file;
    Uint64 start, size, pos;
    hw_pack_header h;
    uint64_t hash;
} window;

static Sint64 SDLCALL win_size(void *u) { return (Sint64)((window *)u)->size; }

static Sint64 SDLCALL win_seek(void *u, Sint64 offset, SDL_IOWhence whence)
{
    window *w = u;
    Sint64 base = whence == SDL_IO_SEEK_SET ? 0 : whence == SDL_IO_SEEK_CUR ? (Sint64)w->pos : (Sint64)w->size;
    Sint64 to = base + offset;
    if (to < 0 || (Uint64)to > w->size) {
        SDL_SetError("seek outside the file");
        return -1;
    }
    w->pos = (Uint64)to;
    return to;
}

static size_t SDLCALL win_read(void *u, void *ptr, size_t n, SDL_IOStatus *status)
{
    window *w = u;
    if (w->pos >= w->size) {
        *status = SDL_IO_STATUS_EOF;
        return 0;
    }
    if (n > w->size - w->pos) n = (size_t)(w->size - w->pos);
    if (SDL_SeekIO(w->file, (Sint64)(w->start + w->pos), SDL_IO_SEEK_SET) < 0) {
        *status = SDL_IO_STATUS_ERROR;
        return 0;
    }
    size_t got = SDL_ReadIO(w->file, ptr, n);
    hw_pack_unmask(&w->h, w->hash, w->pos, ptr, got);
    w->pos += got;
    if (got < n) *status = SDL_IO_STATUS_ERROR;
    return got;
}

static bool SDLCALL win_close(void *u)
{
    window *w = u;
    bool ok = SDL_CloseIO(w->file);
    SDL_free(w);
    return ok;
}

/* Bytes in memory, freed when the stream closes. */
typedef struct membuf {
    uint8_t *data;
    Uint64 size, pos;
} membuf;

static Sint64 SDLCALL mem_size(void *u) { return (Sint64)((membuf *)u)->size; }

static Sint64 SDLCALL mem_seek(void *u, Sint64 offset, SDL_IOWhence whence)
{
    membuf *m = u;
    Sint64 base = whence == SDL_IO_SEEK_SET ? 0 : whence == SDL_IO_SEEK_CUR ? (Sint64)m->pos : (Sint64)m->size;
    Sint64 to = base + offset;
    if (to < 0 || (Uint64)to > m->size) {
        SDL_SetError("seek outside the file");
        return -1;
    }
    m->pos = (Uint64)to;
    return to;
}

static size_t SDLCALL mem_read(void *u, void *ptr, size_t n, SDL_IOStatus *status)
{
    membuf *m = u;
    if (m->pos >= m->size) {
        *status = SDL_IO_STATUS_EOF;
        return 0;
    }
    if (n > m->size - m->pos) n = (size_t)(m->size - m->pos);
    memcpy(ptr, m->data + m->pos, n);
    m->pos += n;
    return n;
}

static bool SDLCALL mem_close(void *u)
{
    membuf *m = u;
    SDL_free(m->data);
    SDL_free(m);
    return true;
}

/* Reads and decodes a whole entry, checking its CRC. */
static uint8_t *read_entry(const mount *mt, const hw_pack_entry *e)
{
    SDL_IOStream *io = SDL_IOFromFile(mt->path, "rb");
    if (!io) return NULL;
    uint8_t *stored = SDL_malloc(e->stored ? e->stored : 1);
    uint8_t *out = e->codec == HW_CODEC_STORE ? stored : SDL_malloc(e->size ? e->size : 1);
    bool ok = stored && out && SDL_SeekIO(io, (Sint64)(mt->base + e->offset), SDL_IO_SEEK_SET) >= 0 && SDL_ReadIO(io, stored, e->stored) == e->stored;
    SDL_CloseIO(io);
    if (ok) {
        hw_pack_unmask(&mt->pack.h, e->hash, 0, stored, e->stored);
        if (e->codec == HW_CODEC_LZ4) ok = hw_lz4_decode(stored, e->stored, out, e->size);
        ok = ok && hw_crc32(0, out, e->size) == e->crc;
    }
    if (out != stored) SDL_free(stored);
    if (!ok) {
        SDL_Log("packs: %s in %s is damaged", mt->pack.names + e->name, mt->path);
        SDL_free(out);
        return NULL;
    }
    return out;
}

SDL_IOStream *hw_vfs_open(hw_vfs *v, const char *path)
{
    const mount *mt = NULL;
    bool removed;
    const hw_pack_entry *e = find(v, path, &mt, &removed);
    if (e && e->codec == HW_CODEC_STORE) {
        window *w = SDL_calloc(1, sizeof *w);
        if (!w) return NULL;
        w->file = SDL_IOFromFile(mt->path, "rb");
        w->start = mt->base + e->offset;
        w->size = e->size;
        w->h = mt->pack.h;
        w->hash = e->hash;
        if (!w->file) {
            SDL_free(w);
            return NULL;
        }
        SDL_IOStreamInterface iface;
        SDL_INIT_INTERFACE(&iface);
        iface.size = win_size;
        iface.seek = win_seek;
        iface.read = win_read;
        iface.close = win_close;
        SDL_IOStream *io = SDL_OpenIO(&iface, w);
        if (!io) win_close(w);
        return io;
    }
    if (e) {
        membuf *m = SDL_calloc(1, sizeof *m);
        if (!m || !(m->data = read_entry(mt, e))) {
            SDL_free(m);
            return NULL;
        }
        m->size = e->size;
        SDL_IOStreamInterface iface;
        SDL_INIT_INTERFACE(&iface);
        iface.size = mem_size;
        iface.seek = mem_seek;
        iface.read = mem_read;
        iface.close = mem_close;
        SDL_IOStream *io = SDL_OpenIO(&iface, m);
        if (!io) mem_close(m);
        return io;
    }
    char full[1100];
    if (removed || !loose_path(v, path, full, sizeof full)) return NULL;
    return SDL_IOFromFile(full, "rb");
}

void *hw_vfs_load(hw_vfs *v, const char *path, size_t *size)
{
    const mount *mt = NULL;
    bool removed;
    const hw_pack_entry *e = find(v, path, &mt, &removed);
    if (e) {
        void *data = read_entry(mt, e);
        if (data) *size = e->size;
        return data;
    }
    char full[1100];
    if (removed || !loose_path(v, path, full, sizeof full)) return NULL;
    return SDL_LoadFile(full, size);
}
