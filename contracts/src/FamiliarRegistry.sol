// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {IVerifiableFactory} from "@ensdomains/verifiable-factory/IVerifiableFactory.sol";

import {EACBaseRolesLib} from "ensv2/access-control/libraries/EACBaseRolesLib.sol";
import {PermissionedRegistry} from "ensv2/registry/PermissionedRegistry.sol";
import {IRegistry} from "ensv2/registry/interfaces/IRegistry.sol";
import {RegistryRolesLib} from "ensv2/registry/libraries/RegistryRolesLib.sol";
import {IPermissionedResolver} from "ensv2/resolver/interfaces/IPermissionedResolver.sol";
import {PermissionedResolver} from "ensv2/resolver/PermissionedResolver.sol";
import {ILabelStore} from "ensv2/utils/interfaces/ILabelStore.sol";
import {LibLabel} from "ensv2/utils/LibLabel.sol";

/// @title FamiliarRegistry
/// @notice ENSv2 subname registry for `<label>.<parent>` (e.g. `ember.familiar.eth`).
///
///         Each Familiar is an agent namespace:
///         - Registered with a rolling 7-day expiry. Every paid visit pushes expiry to `now + 7 days`;
///           skipping a week lets the name expire (the Familiar falls asleep and stops resolving).
///         - Non-transferable: owners are never granted `ROLE_CAN_TRANSFER_ADMIN`.
///         - Gets its own `PermissionedResolver` proxy, deployed through the `VerifiableFactory`.
///           The owner holds every resolver role; the agent key holds `ROLE_SET_TEXT` scoped to the
///           `avatar`, `mood` and `day` keys of this one name, and nothing else.
///         - Bonded: once hatched, a label can only ever be re-hatched (woken) for the same human.
contract FamiliarRegistry is PermissionedRegistry {
    ////////////////////////////////////////////////////////////////////////
    // Types
    ////////////////////////////////////////////////////////////////////////

    struct Familiar {
        /// @dev The human this Familiar is bonded to. Never changes once set.
        address bondedOwner;
        /// @dev Incremented on every hatch/wake; selects a fresh resolver proxy salt.
        uint32 generation;
        /// @dev Number of visits recorded (day counter). Survives dormancy.
        uint32 day;
        /// @dev Resolver of the current generation.
        address resolver;
    }

    ////////////////////////////////////////////////////////////////////////
    // Constants
    ////////////////////////////////////////////////////////////////////////

    /// @notice Length of the dormancy window.
    uint64 public constant LIFESPAN = 7 days;

    /// @dev Token roles granted to owners. Deliberately excludes `ROLE_CAN_TRANSFER_ADMIN`,
    ///      `ROLE_RENEW` and `ROLE_UNREGISTER`.
    uint256 public constant OWNER_TOKEN_ROLES = RegistryRolesLib.ROLE_SET_RESOLVER;

    /// @dev Root roles granted to the operator (backend) that hatches and renews Familiars.
    uint256 public constant OPERATOR_ROOT_ROLES =
        RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_RENEW;

    /// @dev Root roles granted to the admin.
    uint256 public constant ADMIN_ROOT_ROLES =
        RegistryRolesLib.ROLE_REGISTRAR_ADMIN |
        RegistryRolesLib.ROLE_RENEW_ADMIN |
        RegistryRolesLib.ROLE_SET_PARENT |
        RegistryRolesLib.ROLE_SET_PARENT_ADMIN |
        RegistryRolesLib.ROLE_SET_URI |
        RegistryRolesLib.ROLE_SET_URI_ADMIN;

    ////////////////////////////////////////////////////////////////////////
    // Immutables / storage
    ////////////////////////////////////////////////////////////////////////

    /// @notice Factory used to deploy per-Familiar resolver proxies.
    IVerifiableFactory public immutable FACTORY;

    /// @notice `PermissionedResolver` implementation behind every Familiar resolver.
    address public immutable RESOLVER_IMPL;

    /// @notice Agent key allowed to write the Familiar's `avatar`, `mood` and `day` text records.
    address public immutable AGENT;

    /// @notice Namehash of the parent name (e.g. `familiar.eth`).
    bytes32 public immutable PARENT_NODE;

    /// @notice Parent name in dotted form (e.g. `familiar.eth`).
    string public parentName;

    mapping(uint256 labelId => Familiar) internal _familiars;

    ////////////////////////////////////////////////////////////////////////
    // Events / errors
    ////////////////////////////////////////////////////////////////////////

    event Hatched(
        string label,
        bytes32 indexed node,
        address indexed owner,
        address resolver,
        uint32 generation,
        uint64 expiry
    );
    event Visited(bytes32 indexed node, uint32 day, uint64 expiry);

    error BondedToAnother(string label, address bondedOwner);
    error NeverHatched(string label);
    error Dormant(string label);
    error StillAwake(string label);
    error ZeroOwner();

    ////////////////////////////////////////////////////////////////////////
    // Construction
    ////////////////////////////////////////////////////////////////////////

    /// @param labelStore Shared ENSv2 label store.
    /// @param factory ENSv2 `VerifiableFactory`.
    /// @param resolverImpl ENSv2 `PermissionedResolver` implementation.
    /// @param parentName_ Dotted parent name, e.g. `familiar.eth`.
    /// @param admin Account receiving admin root roles.
    /// @param operator Account that hatches/renews Familiars (the backend).
    /// @param agent Account allowed to write the scoped text records.
    constructor(
        ILabelStore labelStore,
        IVerifiableFactory factory,
        address resolverImpl,
        string memory parentName_,
        address admin,
        address operator,
        address agent
    ) PermissionedRegistry(labelStore, admin, ADMIN_ROOT_ROLES) {
        FACTORY = factory;
        RESOLVER_IMPL = resolverImpl;
        AGENT = agent;
        parentName = parentName_;
        PARENT_NODE = NameCoder.namehash(NameCoder.encode(parentName_), 0);
        _grantRoles(ROOT_RESOURCE, OPERATOR_ROOT_ROLES, operator, false);
    }

    ////////////////////////////////////////////////////////////////////////
    // Familiar lifecycle
    ////////////////////////////////////////////////////////////////////////

    /// @notice Hatch `label.<parent>` for `owner` with a fresh resolver and a 7-day lifespan.
    ///         Also used to re-hatch an expired Familiar for the human it is bonded to.
    function hatch(string calldata label, address owner)
        public
        onlyRootRoles(RegistryRolesLib.ROLE_REGISTRAR)
        returns (uint256 tokenId, address resolver)
    {
        if (owner == address(0)) revert ZeroOwner();
        Familiar storage f = _familiars[LibLabel.id(label)];
        if (f.bondedOwner == address(0)) {
            f.bondedOwner = owner;
        } else if (f.bondedOwner != owner) {
            revert BondedToAnother(label, f.bondedOwner);
        }
        uint32 generation = ++f.generation;
        uint64 expiry = uint64(block.timestamp) + LIFESPAN;

        resolver = _deployResolver(label, owner, generation);
        f.resolver = resolver;

        tokenId = _register(label, owner, IRegistry(address(0)), resolver, OWNER_TOKEN_ROLES, expiry, false);
        emit Hatched(label, node(label), owner, resolver, generation, expiry);
    }

    /// @notice Wake a dormant (expired) Familiar for its bonded owner.
    function wake(string calldata label) external returns (uint256 tokenId, address resolver) {
        Familiar storage f = _familiars[LibLabel.id(label)];
        if (f.bondedOwner == address(0)) revert NeverHatched(label);
        if (!isDormant(label)) revert StillAwake(label);
        return hatch(label, f.bondedOwner);
    }

    /// @notice Record a paid visit: increments the day counter and rolls expiry to `now + 7 days`.
    function recordVisit(string calldata label)
        external
        onlyRootRoles(RegistryRolesLib.ROLE_RENEW)
        returns (uint32 day, uint64 expiry)
    {
        if (isDormant(label)) revert Dormant(label);
        uint256 labelId = LibLabel.id(label);
        Familiar storage f = _familiars[labelId];
        day = ++f.day;
        expiry = uint64(block.timestamp) + LIFESPAN;
        uint64 current = getExpiry(labelId);
        if (expiry < current) expiry = current;
        renew(labelId, expiry);
        emit Visited(node(label), day, expiry);
    }

    ////////////////////////////////////////////////////////////////////////
    // Views
    ////////////////////////////////////////////////////////////////////////

    /// @notice Text keys the agent may write.
    function agentTextKeys() public pure returns (string[3] memory) {
        return ["avatar", "mood", "day"];
    }

    /// @notice Full ENS namehash of `label.<parent>`.
    function node(string calldata label) public view returns (bytes32) {
        return NameCoder.namehash(PARENT_NODE, keccak256(bytes(label)));
    }

    /// @notice DNS-encoded `label.<parent>`.
    function dnsName(string calldata label) public view returns (bytes memory) {
        return NameCoder.encode(string.concat(label, ".", parentName));
    }

    /// @notice True if the Familiar was hatched and its name has expired.
    function isDormant(string calldata label) public view returns (bool) {
        uint256 labelId = LibLabel.id(label);
        return _familiars[labelId].bondedOwner != address(0) && _isExpired(getExpiry(labelId));
    }

    /// @notice Familiar state plus current expiry.
    function familiar(string calldata label)
        external
        view
        returns (Familiar memory f, uint64 expiry, bool dormant)
    {
        uint256 labelId = LibLabel.id(label);
        f = _familiars[labelId];
        expiry = getExpiry(labelId);
        dormant = f.bondedOwner != address(0) && _isExpired(expiry);
    }

    ////////////////////////////////////////////////////////////////////////
    // Internal
    ////////////////////////////////////////////////////////////////////////

    /// @dev Deploys a resolver proxy with this registry as temporary admin, grants the agent
    ///      per-key text roles for this name, hands every role to `owner`, then renounces.
    function _deployResolver(string calldata label, address owner, uint32 generation)
        internal
        returns (address resolver)
    {
        uint256 salt = uint256(keccak256(abi.encode(LibLabel.id(label), generation)));
        resolver = FACTORY.deployProxy(
            RESOLVER_IMPL,
            salt,
            abi.encodeCall(
                IPermissionedResolver.initialize,
                (address(this), EACBaseRolesLib.ALL_ROLES, new bytes[](0))
            )
        );
        PermissionedResolver r = PermissionedResolver(resolver);
        bytes memory name = dnsName(label);
        string[3] memory keys = agentTextKeys();
        for (uint256 i; i < keys.length; ++i) {
            r.authorizeTextRoles(name, keys[i], AGENT, true);
        }
        r.grantRootRoles(EACBaseRolesLib.ALL_ROLES, owner);
        r.revokeRootRoles(EACBaseRolesLib.ALL_ROLES, address(this));
    }
}
