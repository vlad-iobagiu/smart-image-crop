"use client";

import { useCallback, useEffect, useState } from "react";
import { ClientSDK } from "@sitecore-marketplace-sdk/client";

const MEDIA_LIBRARY_ROOT = "/sitecore/media library";

const MEDIA_FOLDER_TEMPLATES = [
  "Media library section",
  "Media library folder",
  "Folder",
  "Node",
];

interface MediaItem {
  id: string;
  name: string;
  displayName: string;
  hasChildren: boolean;
  templateName: string;
  mimeType?: string;
  mediaUrl?: string;
}

interface TreeNode extends MediaItem {
  path: string;
  children: TreeNode[];
  isLoaded: boolean;
  isExpanded: boolean;
}

interface MediaLibraryTreeProps {
  client: ClientSDK;
  language?: string;
  onSelect?: (item: MediaItem) => void;
  selectedId?: string;
}

const CHILDREN_QUERY = `
  query GetMediaChildren($path: String!, $language: String!) {
    item(where: { path: $path, language: $language, database: "master" }) {
      itemId
      name
      displayName
      hasChildren
      children {
        nodes {
          itemId
          name
          displayName
          hasChildren
          template {
            name
          }
          field(name: "Mime Type") {
            value
          }
          url
        }
      }
    }
  }
`;

function isFolder(templateName: string) {
  return MEDIA_FOLDER_TEMPLATES.some(
    (t) => t.toLowerCase() === templateName.toLowerCase()
  );
}

function isImage(mimeType?: string) {
  return !!mimeType?.startsWith("image/");
}

function mimeToExt(mimeType?: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png":  ".png",
    "image/gif":  ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/bmp":  ".bmp",
    "image/tiff": ".tiff",
  };
  return mimeType ? (map[mimeType.toLowerCase()] ?? "") : "";
}

function MediaIcon({ templateName, mimeType, hasChildren }: { templateName: string; mimeType?: string; hasChildren: boolean }) {
  if (isFolder(templateName) || hasChildren) return <span>📁</span>;
  if (mimeType?.startsWith("image/")) return <span>🖼️</span>;
  if (mimeType?.startsWith("video/")) return <span>🎬</span>;
  if (mimeType?.startsWith("audio/")) return <span>🎵</span>;
  return <span>📄</span>;
}

async function runGql(
  client: ClientSDK,
  query: string,
  variables: Record<string, unknown> | undefined,
  sitecoreContextId: string | undefined
): Promise<any> {
  return client.mutate("xmc.authoring.graphql", {
    params: {
      body: { query, variables },
      query: sitecoreContextId ? { sitecoreContextId } : undefined,
    },
  });
}


async function fetchChildren(
  client: ClientSDK,
  path: string,
  language: string,
  sitecoreContextId: string | undefined,
  tenantBaseUrl: string | undefined
): Promise<MediaItem[]> {
  const result = await runGql(client, CHILDREN_QUERY, { path, language }, sitecoreContextId);
  const data = (result as any)?.data?.data;
  const nodes = data?.item?.children?.nodes ?? [];

  const base = tenantBaseUrl?.replace(/\/$/, "") ?? "";

  return nodes.map((node: any) => {
    const mimeType: string | undefined = node.field?.value;
    // Build the media delivery URL from the item path rather than node.url,
    // which returns the CMS editing path (/en/sitecore/shell/...).
    const itemPath = `${path}/${node.name}`;
    const mediaRelative = itemPath.replace(/^\/sitecore\/media library\//i, "");
    const ext = mimeToExt(mimeType);
    const mediaUrl = base ? `${base}/-/jssmedia/${mediaRelative}${ext}` : undefined;

    return {
      id: node.itemId,
      name: node.name,
      displayName: node.displayName || node.name,
      hasChildren: node.hasChildren,
      templateName: node.template?.name ?? "",
      mimeType,
      mediaUrl,
    };
  });
}

function TreeNodeRow({
  node,
  depth,
  selectedId,
  onToggle,
  onSelect,
  nodes,
}: {
  node: TreeNode;
  depth: number;
  selectedId?: string;
  onToggle: (id: string) => void;
  onSelect?: (item: MediaItem) => void;
  nodes: Record<string, TreeNode>;
}) {
  const isSelected = node.id === selectedId;
  const expandable = node.hasChildren;
  const selectable = !expandable && isImage(node.mimeType);
  const interactive = expandable || selectable;

  return (
    <div>
      <div
        onClick={() => {
          if (expandable) onToggle(node.id);
          else if (selectable) onSelect?.(node);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          paddingLeft: depth * 16 + 4,
          paddingTop: 4,
          paddingBottom: 4,
          cursor: interactive ? "pointer" : "default",
          opacity: interactive ? 1 : 0.45,
          backgroundColor: isSelected ? "#cce4ff" : "transparent",
          borderRadius: 4,
        }}
        title={node.displayName}
      >
        {expandable && (
          <span style={{ fontSize: 13, width: 12, textAlign: "center", lineHeight: 1 }}>
            {node.isExpanded ? "−" : "+"}
          </span>
        )}
        {!expandable && <span style={{ width: 12 }} />}
        <MediaIcon templateName={node.templateName} mimeType={node.mimeType} hasChildren={node.hasChildren} />
        <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {node.displayName}
        </span>
      </div>
      {node.isExpanded && node.isLoaded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={nodes[child.id] ?? child}
              depth={depth + 1}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
              nodes={nodes}
            />
          ))}
        </div>
      )}
      {node.isExpanded && !node.isLoaded && (
        <div style={{ paddingLeft: (depth + 1) * 16 + 4, fontSize: 12, color: "#888" }}>
          Loading…
        </div>
      )}
    </div>
  );
}

export default function MediaLibraryTree({
  client,
  language = "en",
  onSelect,
  selectedId,
}: MediaLibraryTreeProps) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Record<string, TreeNode>>({});
  const [contextId, setContextId] = useState<string | undefined>(undefined);
  const [tenantBaseUrl, setTenantBaseUrl] = useState<string | undefined>(undefined);

  // Step 1: resolve sitecoreContextId and tenant base URL from host.state
  useEffect(() => {
    Promise.all([
      client.query("host.state"),
      client.query("application.context"),
    ]).then(([hostStateRes, appCtxRes]) => {
      const hostData = hostStateRes.data as any;
      const resource = appCtxRes.data?.resourceAccess?.[0];
      const id: string | undefined =
        hostData?.environment ??
        resource?.context?.preview ??
        resource?.context?.live ??
        resource?.tenantId;

      const baseUrl: string | undefined = hostData?.xmCloudTenantInfo?.url;

      setContextId(id);
      setTenantBaseUrl(baseUrl);
    }).catch((err) => {
      setError(String(err));
      setLoading(false);
    });
  }, [client]);

  // Step 2: load media library root once contextId is resolved
  useEffect(() => {
    if (contextId === undefined) return;
    
    
    setLoading(true);
    fetchChildren(client, MEDIA_LIBRARY_ROOT, language, contextId, tenantBaseUrl)
      .then((items: MediaItem[]) => {
        const initial: TreeNode[] = items.map((item: MediaItem) => ({
          ...item,
          path: `${MEDIA_LIBRARY_ROOT}/${item.name}`,
          children: [],
          isLoaded: false,
          isExpanded: false,
        }));
        const map: Record<string, TreeNode> = {};
        initial.forEach((n) => (map[n.id] = n));
        setNodes(map);
        setRoots(initial);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(String(e));
        setLoading(false);
      });
  }, [client, language, contextId]);

  const handleToggle = useCallback(
    async (id: string) => {
      const node = nodes[id];
      if (!node) return;

      if (node.isExpanded) {
        setNodes((prev) => ({ ...prev, [id]: { ...node, isExpanded: false } }));
        return;
      }

      setNodes((prev) => ({
        ...prev,
        [id]: { ...node, isExpanded: true, isLoaded: false },
      }));

      if (!node.isLoaded) {
        try {
          const children = await fetchChildren(client, node.path, language, contextId, tenantBaseUrl);
          const childNodes: TreeNode[] = children.map((c) => ({
            ...c,
            path: `${node.path}/${c.name}`,
            children: [],
            isLoaded: false,
            isExpanded: false,
          }));
          const newMap: Record<string, TreeNode> = {};
          childNodes.forEach((n) => (newMap[n.id] = n));

          setNodes((prev) => ({
            ...prev,
            ...newMap,
            [id]: { ...prev[id], children: childNodes, isLoaded: true },
          }));
        } catch {
          setNodes((prev) => ({
            ...prev,
            [id]: { ...prev[id], isExpanded: false, isLoaded: false },
          }));
        }
      }
    },
    [client, language, contextId, tenantBaseUrl, nodes]
  );

  if (loading) return <div style={{ padding: 12, color: "#888" }}>Loading media library…</div>;
  if (error) return <div style={{ padding: 12, color: "red" }}>Error: {error}</div>;
  if (roots.length === 0) return <div style={{ padding: 12 }}>No media items found.</div>;

  return (
    <div
      style={{
        fontFamily: "sans-serif",
        border: "1px solid #ddd",
        borderRadius: 6,
        padding: 8,
        maxHeight: 480,
        overflowY: "auto",
        color: "#111",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: "#555" }}>
        Media Library
      </div>
      {roots.map((root) => (
        <TreeNodeRow
          key={root.id}
          node={nodes[root.id] ?? root}
          depth={0}
          selectedId={selectedId}
          onToggle={handleToggle}
          onSelect={onSelect}
          nodes={nodes}
        />
      ))}
    </div>
  );
}
